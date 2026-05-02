import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import App from './App.tsx'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './theme'
import './index.css'

export function render() {
  return renderToString(
    <StrictMode>
      <ThemeProvider>
        <I18nProvider>
          <App />
        </I18nProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}
