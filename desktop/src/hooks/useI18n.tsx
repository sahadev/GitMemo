import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import en from "../locales/en.json";
import zh from "../locales/zh.json";

export type Locale = "en" | "zh";

const locales: Record<Locale, Record<string, unknown>> = { en, zh };

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === "object" && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }
  return typeof current === "string" ? current : path;
}

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    return (localStorage.getItem("gitmemo-locale") as Locale) || "en";
  });

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem("gitmemo-locale", l);
    setLocaleState(l);
  }, []);

  const t = useCallback(
    (key: string, ...args: (string | number)[]) => {
      let str = getNestedValue(locales[locale], key);
      args.forEach((arg, i) => {
        str = str.replace(`{${i}}`, String(arg));
      });
      return str;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
