import React from 'react'
import {createRoot} from 'react-dom/client'
import '@radix-ui/themes/styles.css'
import App from './App'
import './styles.css'
import {ThemePreferenceProvider} from './theme/ThemePreferenceProvider'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root was not found')
}

createRoot(rootElement).render(
  <React.StrictMode>
    <ThemePreferenceProvider>
      <App />
    </ThemePreferenceProvider>
  </React.StrictMode>,
)
