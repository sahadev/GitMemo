import mobileCompare from '../assets/mobile-desktop-compare-20260524.png'
import { useI18n } from '../i18n/useI18n'

export default function MobileApp() {
  const { t } = useI18n()

  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-4 text-center">
          {t('app.mobile.label')}
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-text text-center mb-4">
          {t('app.mobile.title')}
        </h2>
        <p className="text-text-secondary text-center max-w-3xl mx-auto mb-10">
          {t('app.mobile.subtitle')}
        </p>

        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <img
            src={mobileCompare}
            alt={t('app.mobile.alt')}
            className="w-full h-auto block"
          />
        </div>

        <p className="text-center text-xs text-text-secondary mt-4">
          {t('app.mobile.caption')}
        </p>
      </div>
    </section>
  )
}
