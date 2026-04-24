import { beforeEach, describe, expect, it } from 'bun:test'
import { ThemeToggle } from '../components/ThemeToggle'
import { ThemePreferenceProvider } from '../theme/ThemePreferenceProvider'
import { render, setupDom } from './render'

describe('theme toggle behavior', () => {
  beforeEach(() => {
    setupDom()
  })

  // @spec SPEC-CLIENT-THEME
  it('renders the persisted default and toggles the stored theme mode', async () => {
    const view = await render(
      <ThemePreferenceProvider>
        <ThemeToggle />
      </ThemePreferenceProvider>,
    )

    try {
      expect(view.container.textContent).toContain('Dark')
      expect(localStorage.getItem('cardinal-tt.theme-mode')).toBe('dark')

      const switchButton = view.container.querySelector('[role="switch"]')
      expect(switchButton).toBeTruthy()

      await view.click(switchButton as Element)

      expect(view.container.textContent).toContain('Light')
      expect(localStorage.getItem('cardinal-tt.theme-mode')).toBe('light')
    } finally {
      await view.unmount()
    }
  })
})
