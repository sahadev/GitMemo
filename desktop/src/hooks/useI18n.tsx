import { create } from "zustand";
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

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: (localStorage.getItem("gitmemo-locale") as Locale) || "en",
  setLocale: (l: Locale) => {
    localStorage.setItem("gitmemo-locale", l);
    set({ locale: l });
  },
  t: (key: string, ...args: (string | number)[]) => {
    let str = getNestedValue(locales[get().locale], key);
    args.forEach((arg, i) => {
      str = str.replace(`{${i}}`, String(arg));
    });
    return str;
  },
}));
