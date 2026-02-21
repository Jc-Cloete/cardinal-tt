## Spec: Local Project Change Ledger (macOS LaunchAgent, FSEvents, No Attribution, No Restore)

### 1. Goal

Maintain an append-only audit history of file changes across a configured set of project folders under the user’s home directory. Track what changed and when. No process/user attribution beyond “this machine/user”. No checkout/restore.

### 2. Non-Goals

* No remote sync
* No restore/checkout/branching
* No “who changed it” attribution
* No realtime per-keystroke logging; changes are grouped into commits

### 3. Definitions

* **Project**: a watched root folder.
* **Index**: current known state of the project file tree (paths + metadata + optional content hashes).
* **Commit**: an immutable record representing a change batch (timestamp + changed paths + per-path before/after facts).
* **Object store**: optional blob storage of file contents for diffing later.

### 4. Storage Strategy

Two modes (configurable per project):

#### Mode A: Metadata-only (default)

Stores enough to answer:

* which files changed
* type of change (add/modify/delete/rename)
* sizes + mtimes
* optional hash to prove content changed without storing content

No file contents stored.

#### Mode B: Metadata + Content snapshots (optional)

Stores full file blobs for changed text files (and optionally binaries) to allow later diff reconstruction. Still no restore feature exposed, but data exists.

### 5. Requirements

#### Functional

1. Watch N project roots recursively using FSEvents.
2. On event burst, rescan only affected subtrees; produce a normalized **changeset**:

   * Added paths
   * Modified paths
   * Deleted paths
   * Renamed/moved paths (best-effort)
3. Write a commit record to local storage with:

   * commit_id
   * project_id
   * timestamp_start, timestamp_end
   * sequence number
   * list of changed entries with before/after metadata
   * optional content blob references (Mode B)
4. Provide a CLI for:

   * list projects
   * list commits (time range, limit)
   * show commit details
   * show file history
   * show diff between two commits (Mode B; Mode A limited to metadata diff)

#### Non-functional

* Low overhead, safe as background service
* Must tolerate editor temp files and rapid changes
* Crash-safe: commits are atomic, index consistent
* Scales to large repos (100k+ files) with ignores

### 6. Platform / Runtime

* macOS user-level background service via LaunchAgent
* Runs under user session, watches only within `$HOME`
* Implementation language: either Swift (native) or Go/Rust/Python with FSEvents bindings

  * Recommended: Swift (CoreServices FSEvents is stable and native)
  * Acceptable: Go/Rust with well-maintained FSEvents wrapper

### 7. Data Model

#### Project

* project_id (uuid)
* name (string)
* root_path (absolute)
* enabled (bool)
* ignore_rules (list)
* mode (metadata_only | content_snapshots)
* max_blob_size_bytes
* debounce_ms
* commit_idle_ms
* commit_max_interval_ms

#### Index Entry

* rel_path
* kind (file/dir/symlink)
* size
* mtime_ns
* inode
* device
* mode_bits (optional)
* hash (optional, lazy)
* symlink_target (if symlink)

#### Commit

* commit_id (uuid or monotonic id)
* project_id
* parent_commit_id (optional)
* started_at_ns
* ended_at_ns
* event_cursor_start (FSEvents id)
* event_cursor_end
* change_count
* changed_entries[] (see below)

#### Changed Entry

* rel_path (current)
* op (ADD | MODIFY | DELETE | RENAME)
* old_rel_path (only for RENAME)
* before: {size, mtime_ns, hash?, inode?, kind}
* after:  {size, mtime_ns, hash?, inode?, kind}
* blob_before? (Mode B)
* blob_after?  (Mode B)

### 8. Ignore Rules

* Default ignore set applied globally:

  * `.git/`, `.hg/`, `.svn/`
  * `node_modules/`, `dist/`, `build/`, `.next/`, `.turbo/`
  * `DerivedData/`, `Pods/`, `.gradle/`, `target/`
  * `*.log`, `*.tmp`, swap files
* Per-project ignore file supported:

  * `.cardinaldiffignore` at project root
  * Gitignore-like glob matching (no need to fully implement every gitignore edge-case; must support common patterns)

### 9. Event Handling Pipeline

#### 9.1 Watcher

* Register one FSEvents stream per project root.
* Persist last seen event ID per project (cursor) for restart continuity.

#### 9.2 Debounce

* On any event: record “dirty subtree path” candidates.
* Debounce window: `debounce_ms` (e.g., 500ms).
* Coalesce multiple events into a single scan job.

#### 9.3 Targeted Rescan

* Rescan:

  * If event flags include “must rescan subtree” (or root-level noise), rescan whole project.
  * Otherwise rescan smallest common ancestor directories for the dirty set.
* Scan produces a “current view” map for the scanned region.

#### 9.4 Change Detection

Compare new scan results to index:

* New path present now, absent before -> ADD
* Path absent now, present before -> DELETE
* Path present in both, metadata differs -> candidate MODIFY

  * If size/mtime differs: mark modified
  * If hash enabled: compute hash on demand to confirm content change
* Rename detection (best-effort):

  * inode/device match moved path -> RENAME
  * else hash match between deleted+added in same commit batch -> RENAME (content-based)

#### 9.5 Commit Formation

* Maintain “pending changes” buffer.
* Commit triggers:

  * no new events for `commit_idle_ms` (e.g., 2000ms), OR
  * pending duration exceeds `commit_max_interval_ms` (e.g., 60000ms)
* Commit time is ended_at_ns; started_at_ns is first change in batch.
* Write commit + update index atomically.

### 10. Persistence Layer

#### 10.1 Directory Layout

`~/.cardinal-diff/`

* `config.json`
* `projects/` (project configs)
* `index/` (SQLite per project or single SQLite with project_id)
* `commits/` (SQLite table + optional JSON export)
* `objects/` (Mode B blobs by hash)
* `logs/`

#### 10.2 Database (SQLite)

Tables:

* projects
* index_entries (project_id, rel_path PK)
* commits
* commit_entries

Indexes:

* (project_id, ended_at_ns)
* (project_id, rel_path, ended_at_ns) for history queries

Atomicity:

* Use single transaction for:

  * insert commit
  * insert commit_entries
  * apply index updates
  * update fsevents cursor

### 11. CLI Specification

Binary: `cardinaldiff`

Commands:

* `cardinaldiff projects list`
* `cardinaldiff projects add --path <dir> [--name <name>] [--mode metadata|content]`
* `cardinaldiff projects remove <project_id>`
* `cardinaldiff commits list --project <id> [--since ...] [--until ...] [--limit N]`
* `cardinaldiff commit show <commit_id>`
* `cardinaldiff file history --project <id> --path <rel_path> [--limit N]`
* `cardinaldiff diff --project <id> --from <commit_id> --to <commit_id> [--path <rel_path>]`

  * Mode A: metadata diff only
  * Mode B: textual diff when both blobs available and file considered text

Text detection (Mode B):

* treat as text if UTF-8 decodes and low NUL byte ratio
* otherwise “binary changed”

### 12. LaunchAgent

* Install plist at:

  * `~/Library/LaunchAgents/com.cardinaldiff.agent.plist`
* Runs:

  * `cardinaldiff agent run`
* Restarts on crash, logs to `~/.cardinal-diff/logs/agent.log`

### 13. Configuration Defaults

* debounce_ms: 500
* commit_idle_ms: 2000
* commit_max_interval_ms: 60000
* hash_policy:

  * default: off; enable per project if you need content certainty
* max_blob_size_bytes (Mode B): 5 MB default
* scanning concurrency: 1–2 worker threads (keep low)

### 14. Failure Modes / Recovery

* On startup:

  * load last cursor
  * if cursor invalid or overflow: mark project “needs full rescan” and rebuild index
* If commit transaction fails:

  * rollback; do not update index
* If index drift suspected (rare):

  * periodic integrity scan option: `cardinaldiff doctor --project <id>`

### 15. Minimal MVP Acceptance Criteria

* Watches 3+ repos concurrently without noticeable lag.
* Produces stable commits during common workflows (git checkout, npm install, IDE indexing).
* `commits list` shows sensible timeline.
* `commit show` reliably lists added/modified/deleted/renamed paths.
* Survives restart without losing continuity.

### 16. Implementation Notes (tight constraints)

* Do not attempt per-file watchers; only FSEvents per root.
* Do not hash everything on scan; hash on-demand for modified candidates.
* Always treat FSEvents as a hint; rescan is the source of truth.
* Always ignore `.git` and build artifact paths by default.

### 17. Deliverables

* `cardinaldiff` CLI + agent subcommand
* LaunchAgent plist installer/uninstaller scripts
* Config + default ignore templates
* SQLite schema migrations
* Log + metrics: commits created, files scanned, scan duration, pending queue depth
