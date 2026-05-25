import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ReadmePage from './pages/ReadmePage.tsx'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './theme'

const Component = window.location.pathname.replace(/\/+$/, '') === '/readme' ? ReadmePage : App

hydrateRoot(
  document.getElementById('root')!,
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <Component />
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)
