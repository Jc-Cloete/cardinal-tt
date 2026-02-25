import React from 'react'
import { createRoot } from 'react-dom/client'
import '@radix-ui/themes/styles.css'
import App from './App'
import { ToastProvider } from './notifications/ToastProvider'
import { clientLogger } from './observability/logger'
import './styles.css'
import { ThemePreferenceProvider } from './theme/ThemePreferenceProvider'

const mainLogger = clientLogger.child({ component: 'main' })

const rootElement = document.getElementById('root')

if (!rootElement) {
  mainLogger.log({
    event: 'client.main.root_missing',
    level: 'error',
    outcome: 'error',
    fields: {
      selector: '#root',
    },
  })
  throw new Error('Root element #root was not found')
}

mainLogger.log({
  event: 'client.main.render.start',
  fields: {
    selector: '#root',
  },
})

createRoot(rootElement).render(
  <React.StrictMode>
    <ThemePreferenceProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemePreferenceProvider>
  </React.StrictMode>,
)

mainLogger.log({
  event: 'client.main.render.complete',
  fields: {
    selector: '#root',
  },
})
