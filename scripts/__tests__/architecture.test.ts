import { describe, expect, it } from 'bun:test'
import { evaluateImport } from '../architecture'

describe('architecture boundary helpers', () => {
  it('allows declared workspace dependencies', () => {
    expect(
      evaluateImport({
        importerWorkspace: 'server',
        importerPath: '/repo/server/src/cache.ts',
        specifier: 'cardinal-store',
        repoRoot: '/repo',
      }),
    ).toBeNull()
  })

  it('rejects undeclared workspace package imports', () => {
    expect(
      evaluateImport({
        importerWorkspace: 'client',
        importerPath: '/repo/client/src/App.tsx',
        specifier: 'cardinal-store',
        repoRoot: '/repo',
      }),
    ).toEqual(
      'client may not import cardinal-store from /repo/client/src/App.tsx; allowed local packages: cardinal-observability',
    )
  })

  it('rejects relative imports that cross into another workspace', () => {
    expect(
      evaluateImport({
        importerWorkspace: 'cardinal-store',
        importerPath: '/repo/cardinal-store/src/db.ts',
        specifier: '../../server/src/config',
        repoRoot: '/repo',
      }),
    ).toEqual(
      'cardinal-store may not import server via ../../server/src/config from /repo/cardinal-store/src/db.ts',
    )
  })
})
