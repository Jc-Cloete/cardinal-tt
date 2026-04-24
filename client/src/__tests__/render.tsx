import { Window } from 'happy-dom'
import type { ReactElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

type RenderResult = {
  container: HTMLElement
  root: Root
  click: (element: Element) => Promise<void>
  unmount: () => Promise<void>
}

export const setupDom = (): void => {
  const window = new Window({ url: 'http://localhost/' })
  window.SyntaxError = SyntaxError
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList) as unknown as typeof window.matchMedia

  let animationFrameId = 0
  const animationFrameTimers = new Map<number, ReturnType<typeof setTimeout>>()

  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    window,
    document: window.document,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    HTMLInputElement: window.HTMLInputElement,
    MouseEvent: window.MouseEvent,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      animationFrameId += 1
      const timeoutId = setTimeout(() => callback(Date.now()), 0)
      animationFrameTimers.set(animationFrameId, timeoutId)
      return animationFrameId
    },
    cancelAnimationFrame: (id: number) => {
      const timeoutId = animationFrameTimers.get(id)
      if (timeoutId) {
        clearTimeout(timeoutId)
        animationFrameTimers.delete(id)
      }
    },
  })
}

export const render = async (element: ReactElement): Promise<RenderResult> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(element)
  })

  return {
    container,
    root,
    click: async (target: Element) => {
      await act(async () => {
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
    },
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}
