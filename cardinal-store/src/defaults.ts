export const DEFAULT_IGNORE_PATTERNS = [
  '.git/**',
  '.hg/**',
  '.svn/**',
  'node_modules/**',
  'dist/**',
  'build/**',
  '.next/**',
  '.turbo/**',
  'DerivedData/**',
  'Pods/**',
  '.gradle/**',
  'target/**',
  '*.log',
  '*.tmp',
  '*.swp',
  '*.swo',
]

export const DEFAULT_DEBOUNCE_MS = 500
export const DEFAULT_COMMIT_IDLE_MS = 2000
export const DEFAULT_COMMIT_MAX_INTERVAL_MS = 60000
export const DEFAULT_MAX_BLOB_SIZE_BYTES = 5 * 1024 * 1024
