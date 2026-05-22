import { createContext } from 'react'

export type Theme = 'dark' | 'light'

export interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextType>(null!)
