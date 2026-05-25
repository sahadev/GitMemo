import { StrictMode } from 'react'
import { lazy, Suspense } from 'react'
import { hydrateRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './theme'

const ReadmePage = lazy(() => import('./pages/ReadmePage.tsx'))
const Component = window.location.pathname.replace(/\/+$/, '') === '/readme' ? ReadmePage : App

hydrateRoot(
  document.getElementById('root')!,
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <Suspense fallback={null}>
          <Component />
        </Suspense>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)
