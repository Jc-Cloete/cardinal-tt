import { describe, expect, it } from 'bun:test'
import { parseWindowSampleOutput } from '../window'

describe('window sample parsing', () => {
  // @spec SPEC-ACTIVITY-WINDOW-SAMPLE
  it('parses active window sample output', () => {
    const parsed = parseWindowSampleOutput(
      'Firefox\t1234\torg.mozilla.firefox\tProject board',
      '2026-02-25T10:00:00.000Z',
    )

    expect(parsed?.appName).toBe('Firefox')
    expect(parsed?.ownerPid).toBe(1234)
    expect(parsed?.bundleId).toBe('org.mozilla.firefox')
    expect(parsed?.windowTitle).toBe('Project board')
  })

  it('returns null for invalid output', () => {
    expect(parseWindowSampleOutput('', '2026-02-25T10:00:00.000Z')).toBeNull()
    expect(parseWindowSampleOutput('missing\tparts', '2026-02-25T10:00:00.000Z')).toBeNull()
  })
})
