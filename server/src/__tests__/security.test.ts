import { describe, expect, it } from 'bun:test'
import { isAllowedLocalOrigin } from '../security'

describe('server local security policy', () => {
  // @spec SPEC-SERVER-LOCAL-SECURITY
  it('allows loopback browser origins and rejects remote origins', () => {
    expect(isAllowedLocalOrigin(undefined)).toBe(true)
    expect(isAllowedLocalOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedLocalOrigin('http://127.0.0.1:5173')).toBe(true)
    expect(isAllowedLocalOrigin('http://[::1]:5173')).toBe(true)

    expect(isAllowedLocalOrigin('https://example.com')).toBe(false)
    expect(isAllowedLocalOrigin('file:///tmp/index.html')).toBe(false)
    expect(isAllowedLocalOrigin('not-a-url')).toBe(false)
  })
})
