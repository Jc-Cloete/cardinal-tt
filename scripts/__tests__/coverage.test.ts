import { describe, expect, it } from 'bun:test'
import { evaluateCoverage, parseCoverageSummary } from '../coverage'

describe('coverage gate helpers', () => {
  it('parses Bun text coverage summary for the all-files row', () => {
    const output = `
-----------------------|---------|---------|-------------------
File                   | % Funcs | % Lines | Uncovered Line #s
-----------------------|---------|---------|-------------------
All files              |   88.13 |   90.51 |
 src/utils/date.ts     |   90.00 |   88.14 | 27-32
-----------------------|---------|---------|-------------------
`

    expect(parseCoverageSummary(output)).toEqual({
      functions: 88.13,
      lines: 90.51,
    })
  })

  it('reports each threshold miss with the measured value', () => {
    const failures = evaluateCoverage(
      'server',
      { functions: 88.13, lines: 90.51 },
      { functions: 90, lines: 92 },
    )

    expect(failures).toEqual([
      'server function coverage 88.13% is below threshold 90.00%',
      'server line coverage 90.51% is below threshold 92.00%',
    ])
  })
})
