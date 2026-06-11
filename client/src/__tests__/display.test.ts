import { describe, expect, it } from 'bun:test'
import { ALL_PROJECTS, UNKNOWN_PROJECT } from '../constants'
import { getProjectDisplayName, toRoleLabel } from '../utils/display'

describe('client display utils', () => {
  // @spec SPEC-CLIENT-DISPLAY
  it('formats project labels for known, unknown, and all-project variants', () => {
    expect(getProjectDisplayName(ALL_PROJECTS)).toBe('All projects')
    expect(getProjectDisplayName(UNKNOWN_PROJECT)).toBe('Unknown project')
    expect(getProjectDisplayName('/workspace/code/cardinal-tt/')).toBe('cardinal-tt')
  })

  it('maps role labels for user/assistant and fallback roles', () => {
    expect(toRoleLabel('assistant')).toBe('Agent')
    expect(toRoleLabel('user')).toBe('User')
    expect(toRoleLabel('system')).toBe('system')
    expect(toRoleLabel('')).toBe('Unknown')
  })
})
