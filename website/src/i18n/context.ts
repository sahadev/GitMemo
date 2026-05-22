import { createContext } from 'react'

export type Lang = 'en' | 'zh'

export interface I18nContextType {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string) => string
}

export const I18nContext = createContext<I18nContextType>(null!)
