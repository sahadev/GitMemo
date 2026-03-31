import { LayoutDashboard, FileText, Clipboard, Search } from 'lucide-react'
import { useI18n } from '../i18n'

export default function DesktopApp() {
  const { t } = useI18n()

  const highlights = [
    { icon: <LayoutDashboard size={16} />, labelKey: 'app.dashboard' },
    { icon: <FileText size={16} />, labelKey: 'app.notes' },
    { icon: <Clipboard size={16} />, labelKey: 'app.clipboard' },
    { icon: <Search size={16} />, labelKey: 'app.search' },
  ]

  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto">
        <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-4 text-center">{t('app.label')}</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4">{t('app.title')}</h2>
        <p className="text-text-secondary text-center max-w-2xl mx-auto mb-8">
          {t('app.subtitle')}
          <br />
          <span className="text-accent-light">{t('app.tauri')}</span>
        </p>

        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {highlights.map((h) => (
            <span key={h.labelKey} className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm text-text-secondary bg-surface border border-border">
              <span className="text-accent">{h.icon}</span>
              {t(h.labelKey)}
            </span>
          ))}
        </div>

        <div className="relative rounded-xl overflow-hidden border border-border bg-surface">
          <div className="aspect-video flex items-center justify-center bg-gradient-to-br from-surface to-surface-2">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-[rgba(99,102,241,0.1)] flex items-center justify-center mx-auto mb-4">
                <img src="/logo.png" alt="GitMemo" className="w-12 h-12 rounded-lg" />
              </div>
              <p className="text-white font-semibold text-lg mb-2">GitMemo Desktop v0.2</p>
              <p className="text-text-secondary text-sm">{t('app.screenshot')}</p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <span className="px-3 py-1 rounded text-xs bg-[rgba(99,102,241,0.1)] text-accent">Tauri 2</span>
                <span className="px-3 py-1 rounded text-xs bg-[rgba(99,102,241,0.1)] text-accent">React 19</span>
                <span className="px-3 py-1 rounded text-xs bg-[rgba(99,102,241,0.1)] text-accent">Rust</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
