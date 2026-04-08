import { useI18n } from '../i18n'

export default function Footer() {
  const { t } = useI18n()

  return (
    <footer className="py-16 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-text mb-4">{t('footer.cta.title')}</h2>
          <p className="text-text-secondary mb-8">{t('footer.cta.subtitle')}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="https://github.com/sahadev/GitMemo/releases/latest" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent text-white font-semibold text-sm hover:bg-accent-light transition-colors">
              {t('footer.getStarted')}
            </a>
            <a href="https://github.com/sahadev/GitMemo" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border text-text font-semibold text-sm hover:border-[rgba(0,122,255,0.4)] hover:text-accent transition-colors">
              <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              {t('footer.star')}
            </a>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-8 border-t border-border/50">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="GitMemo" className="w-6 h-6 rounded" />
            <span className="text-sm text-text-secondary">GitMemo &middot; {t('footer.mit')}</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-text-secondary">
            <a href="https://github.com/sahadev/GitMemo" className="hover:text-text transition-colors">GitHub</a>
            <a href="https://github.com/sahadev/GitMemo/releases" className="hover:text-text transition-colors">Releases</a>
            <a href="https://github.com/sahadev/GitMemo#readme" className="hover:text-text transition-colors">Docs</a>
            <a href="https://github.com/sahadev/GitMemo/issues/new?labels=feedback&title=Feedback%3A+" className="hover:text-text transition-colors">Feedback</a>
          </div>
          <p className="text-xs text-text-secondary">Built with Rust &middot; Tauri &middot; React</p>
        </div>
      </div>
    </footer>
  )
}
