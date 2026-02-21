# cardinal-diff

Background filesystem change tracker for macOS.

It watches configured project roots with FSEvents, batches changes into immutable commits, and writes data through the shared `cardinal-store` workspace.

## Scripts

```bash
bun run dev
bun run start
bun run typecheck
bun run doctor -- --project <project_id>
bun run agent:install
bun run agent:uninstall
```

## CLI

```bash
bun run start projects list
bun run start projects add --path /absolute/path --name my-project --mode metadata --hash-policy off
bun run start projects remove <project_id>
bun run start projects reprocess <project_id>
bun run start commits list --project <project_id> --limit 100
bun run start commit show <commit_id>
bun run start file history --project <project_id> --path src/index.ts
bun run start diff --project <project_id> --from <commit_id> --to <commit_id>
bun run start doctor --project <project_id>
bun run start agent run
```

Reprocess guard behavior:

- By default, reprocess refuses to run while a fresh, live agent heartbeat is detected.
- Override only when intentional: `bun run start projects reprocess <project_id> --allow-active-agent`

Ignore behavior:

- Default ignore patterns are always active (VCS/build/temp paths).
- `.cardinaldiffignore` at project root extends default patterns.
- `.gitignore` rules are respected from project root and nested directories.
- Negated gitignore rules (for example `!keep.tmp`) are supported.

## Runtime Paths

- `~/.cardinal-diff/config.json`
- `~/.cardinal-diff/projects/*.json`
- `~/.cardinal-diff/index/cardinaldiff.sqlite`
- `~/.cardinal-diff/objects/**`
- `~/.cardinal-diff/logs/*`
- `~/Library/LaunchAgents/com.cardinaldiff.agent.plist`

## Source Layout

- `src/agent.ts`: watcher lifecycle, debounce/flush timers, heartbeat writes, launch agent helpers.
- `src/scanner.ts`: subtree/full-tree scanners + index region replacement.
- `src/change-detector.ts`: before/after diffing + rename detection + content/hash decisions.
- `src/pending-buffer.ts`: merge logic for pending change batches.
- `src/service.ts`: domain service layer for projects/commits/scans.
- `src/diff.ts`: textual/binary diff generation from commit entries and blob store.
- `src/object-store.ts`: blob sharding and retrieval.
- `src/db.ts`: shared-store bindings.
- `src/types.ts`: re-exports strict shared types from `cardinal-store`.
