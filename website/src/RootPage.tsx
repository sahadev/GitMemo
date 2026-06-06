import { lazy } from 'react'
import App from './App'

const ReadmePage = lazy(() => import('./pages/ReadmePage'))

export default function RootPage() {
  const Component = window.location.pathname.replace(/\/+$/, '') === '/readme' ? ReadmePage : App
  return <Component />
}
