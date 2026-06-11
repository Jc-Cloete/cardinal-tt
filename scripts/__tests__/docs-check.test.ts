import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { evaluateDocumentation, extractLocalMarkdownLinks } from '../docs-check'

const createTempRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'cardinal-docs-'))

describe('docs check helpers', () => {
  it('extracts only local markdown links', () => {
    expect(
      extractLocalMarkdownLinks(
        '[readme](README.md) [external](https://example.com) [anchor](#section)',
      ),
    ).toEqual([{ line: 1, target: 'README.md' }])
  })

  it('reports missing required documentation paths', () => {
    const repoRoot = createTempRepo()

    expect(
      evaluateDocumentation({
        repoRoot,
        requiredPaths: ['README.md', 'AGENTS.md'],
        markdownFiles: [],
      }),
    ).toEqual([
      'Missing required documentation path: README.md',
      'Missing required documentation path: AGENTS.md',
    ])
  })

  it('reports broken and absolute local links', () => {
    const repoRoot = createTempRepo()
    const readmePath = path.join(repoRoot, 'README.md')
    fs.writeFileSync(
      readmePath,
      ['[ok](docs/index.md)', '[missing](docs/missing.md)', '[absolute](/private/example.md)'].join(
        '\n',
      ),
    )
    fs.mkdirSync(path.join(repoRoot, 'docs'))
    fs.writeFileSync(path.join(repoRoot, 'docs/index.md'), '# Docs\n')

    expect(
      evaluateDocumentation({
        repoRoot,
        requiredPaths: [],
        markdownFiles: [readmePath],
      }),
    ).toEqual([
      'README.md:2 has a broken local link: docs/missing.md',
      'README.md:3 uses an absolute local link: /private/example.md',
    ])
  })
})
