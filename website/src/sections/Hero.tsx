import { Download, Sun, Moon } from 'lucide-react'
import Terminal from '../components/Terminal'
import { useI18n } from '../i18n'
import { useTheme } from '../theme'

export default function Hero() {
  const { t, lang, setLang } = useI18n()
  const { theme, toggleTheme } = useTheme()

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 hero-grid overflow-hidden">
      {/* Gradient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[radial-gradient(ellipse,rgba(0,122,255,0.12),transparent_60%)]" />
      </div>

      {/* Theme + Language toggles */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary hover:text-text transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <div className="flex items-center gap-1 rounded-full bg-surface border border-border px-1 py-1">
          <button
            onClick={() => setLang('en')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${lang === 'en' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text'}`}
          >
            EN
          </button>
          <button
            onClick={() => setLang('zh')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${lang === 'zh' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text'}`}
          >
            中文
          </button>
        </div>
      </div>

      {/* Logo + badge */}
      <div className="relative z-10 flex flex-col items-center mb-8">
        <img src="/logo.png" alt="GitMemo" className="w-16 h-16 mb-4 rounded-xl" />
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[rgba(0,122,255,0.1)] text-accent-light border border-[rgba(0,122,255,0.2)]">
          {t('hero.badge')}
        </span>
      </div>

      {/* Headline */}
      <h1 className="relative z-10 text-4xl sm:text-5xl lg:text-6xl font-extrabold text-text text-center max-w-4xl leading-tight tracking-tight">
        {t('hero.title1')}
        <br />
        <span className="text-accent-light">{t('hero.title2')}</span>
      </h1>

      <p className="relative z-10 mt-6 text-lg text-text-secondary text-center max-w-2xl leading-relaxed">
        {t('hero.subtitle')}
        <br className="hidden sm:block" />
        {t('hero.subtitle2')}
      </p>

      {/* CTAs */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-4 mt-10">
        <a
          href="https://github.com/sahadev/GitMemo/releases/latest"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent text-white font-semibold text-sm hover:bg-accent-light transition-colors"
        >
          <Download size={18} />
          {t('hero.download')}
        </a>
        <a
          href="https://github.com/sahadev/GitMemo"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-transparent border border-border text-text font-semibold text-sm hover:border-[rgba(0,122,255,0.4)] hover:text-accent transition-colors"
        >
          <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          {t('hero.github')}
        </a>
      </div>

      {/* Terminal */}
      <div className="relative z-10 mt-16 w-full max-w-2xl">
        <Terminal />
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-text-secondary text-xs animate-bounce">
        ↓
      </div>
    </section>
  )
}
