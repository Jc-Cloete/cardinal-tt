import { describe, expect, it } from 'bun:test'
import { evaluateSpecReferences, extractSpecIds, extractTestSpecIds } from '../spec-enforcement'

describe('spec enforcement helpers', () => {
  it('extracts unique spec IDs from markdown and test annotations', () => {
    expect(
      extractSpecIds(`
| ID | Requirement |
| --- | --- |
| SPEC-SERVER-VALIDATION | Runtime validation is centralized. |
| SPEC-SERVER-VALIDATION | Duplicate mention in same doc prose. |
`),
    ).toEqual(['SPEC-SERVER-VALIDATION'])

    expect(
      extractTestSpecIds(`
${'//'} ${'@'}spec SPEC-SERVER-VALIDATION
it('validates input', () => {})
`),
    ).toEqual(['SPEC-SERVER-VALIDATION'])
  })

  it('reports documented IDs without tests', () => {
    expect(
      evaluateSpecReferences({
        specFiles: new Map([
          ['docs/specs/server.spec.md', ['SPEC-SERVER-VALIDATION', 'SPEC-SERVER-SAFE-PATHS']],
        ]),
        testFiles: new Map([
          ['server/src/__tests__/requests-fs.test.ts', ['SPEC-SERVER-SAFE-PATHS']],
        ]),
      }),
    ).toEqual(['SPEC-SERVER-VALIDATION is documented but has no @spec test reference'])
  })

  it('reports test references that are not documented', () => {
    expect(
      evaluateSpecReferences({
        specFiles: new Map([['docs/specs/server.spec.md', ['SPEC-SERVER-SAFE-PATHS']]]),
        testFiles: new Map([['server/src/__tests__/requests-fs.test.ts', ['SPEC-SERVER-MISSING']]]),
      }),
    ).toEqual([
      'SPEC-SERVER-MISSING is referenced by tests but is not documented in docs/specs',
      'SPEC-SERVER-SAFE-PATHS is documented but has no @spec test reference',
    ])
  })

  it('reports IDs duplicated across spec documents', () => {
    expect(
      evaluateSpecReferences({
        specFiles: new Map([
          ['docs/specs/server.spec.md', ['SPEC-SHARED-ID']],
          ['docs/specs/client.spec.md', ['SPEC-SHARED-ID']],
        ]),
        testFiles: new Map([['server/src/__tests__/requests-fs.test.ts', ['SPEC-SHARED-ID']]]),
      }),
    ).toEqual([
      'SPEC-SHARED-ID appears in multiple spec docs: docs/specs/client.spec.md, docs/specs/server.spec.md',
    ])
  })
})
