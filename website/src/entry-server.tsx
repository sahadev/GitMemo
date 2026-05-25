import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import App from './App.tsx'
import ReadmePage from './pages/ReadmePage.tsx'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './theme'
import './index.css'

export function render(path = '/') {
  const Component = path.replace(/\/+$/, '') === '/readme' ? ReadmePage : App

  return renderToString(
    <StrictMode>
      <ThemeProvider>
        <I18nProvider>
          <Component />
        </I18nProvider>
      </ThemeProvider>
    </StrictMode>,
  )
}
