import { BookOpen, Download, Moon, Sun } from 'lucide-react'
import { useI18n } from '../i18n/useI18n'
import { useTheme } from '../useTheme'

export default function TopNav() {
  const { t, lang, setLang } = useI18n()
  const { theme, toggleTheme } = useTheme()

  const links = [
    { href: '#scenarios', label: t('nav.scenarios') },
    { href: '#downloads-section', label: t('nav.downloads') },
    { href: '#features', label: t('nav.features') },
    { href: '#comparison', label: t('nav.comparison') },
    { href: '/readme/', label: t('nav.readme') },
    { href: '/llms.txt', label: t('nav.llms') },
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-surface/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a href="/" className="flex items-center gap-2 text-sm font-bold text-text">
          <img src="/logo.png" alt="" className="h-7 w-7 rounded" />
          <span>GitMemo</span>
        </a>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:bg-surface-2 hover:text-text"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <div className="flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-1">
            <button
              onClick={() => setLang('en')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${lang === 'en' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text'}`}
            >
              EN
            </button>
            <button
              onClick={() => setLang('zh')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${lang === 'zh' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text'}`}
            >
              中文
            </button>
          </div>
          <a
            href="#downloads-section"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:text-text md:hidden"
            aria-label={t('nav.downloads')}
          >
            <Download size={15} />
          </a>
          <a
            href="/readme/"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:text-text md:hidden"
            aria-label={t('nav.readme')}
          >
            <BookOpen size={15} />
          </a>
          <a
            href="https://github.com/sahadev/GitMemo"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:text-text"
            aria-label="GitHub"
          >
            <svg viewBox="0 0 24 24" width={15} height={15} fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
        </div>
      </nav>
    </header>
  )
}
