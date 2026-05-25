import { Download } from 'lucide-react'
import Terminal from '../components/Terminal'
import { useI18n } from '../i18n/useI18n'
import { useTheme } from '../useTheme'

export default function Hero() {
  const { t } = useI18n()
  const { theme } = useTheme()

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 py-24 hero-grid overflow-hidden">
      {/* Gradient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[radial-gradient(ellipse,rgba(0,122,255,0.12),transparent_60%)]" />
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

      <p className="relative z-10 mt-6 text-lg text-text-secondary text-center w-full max-w-5xl leading-relaxed whitespace-pre-line">
        {t('hero.subtitle')}
        <br className="hidden sm:block" />
        {t('hero.subtitle2')}
      </p>

      {/* CTAs */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-4 mt-10">
        <a
          href="#downloads"
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

      {/* Product Hunt */}
      <a
        href="https://www.producthunt.com/products/gitmemo?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-gitmemo"
        target="_blank"
        rel="noopener noreferrer"
        className="relative z-10 mt-8"
      >
        <img
          alt="GitMemo - Save AI conversations and notes into your Git repo. | Product Hunt"
          width="250"
          height="54"
          src={`https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1125906&theme=${theme === 'dark' ? 'dark' : 'light'}`}
        />
      </a>

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
