import { StrictMode } from 'react'
import { Suspense } from 'react'
import { hydrateRoot } from 'react-dom/client'
import './index.css'
import { I18nProvider } from './i18n'
import { ThemeProvider } from './theme'
import RootPage from './RootPage'

hydrateRoot(
  document.getElementById('root')!,
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <Suspense fallback={null}>
          <RootPage />
        </Suspense>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)
