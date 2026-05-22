import { useContext } from 'react'
import { ThemeContext } from './theme-context'

export function useTheme() {
  return useContext(ThemeContext)
}
