import { Bot, GitBranch, MonitorSmartphone } from 'lucide-react'
import FadeIn from '../components/FadeIn'
import { useI18n } from '../i18n/useI18n'

const ASSET_BASE_URL = (import.meta.env.VITE_WEBSITE_ASSET_BASE_URL || '').trim().replace(/\/$/, '')
const ARCHITECTURE_FALLBACK_IMAGE = '/website/assets/gitmemo-core-architecture.png'
const ARCHITECTURE_IMAGE = ASSET_BASE_URL
  ? `${ASSET_BASE_URL}${ARCHITECTURE_FALLBACK_IMAGE}`
  : ARCHITECTURE_FALLBACK_IMAGE

export default function CoreArchitecture() {
  const { t } = useI18n()

  const points = [
    { icon: <MonitorSmartphone size={18} />, labelKey: 'core.point.clients' },
    { icon: <Bot size={18} />, labelKey: 'core.point.ai' },
    { icon: <GitBranch size={18} />, labelKey: 'core.point.git' },
  ]

  return (
    <section className="px-6 py-24 border-t border-border overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <FadeIn>
          <div className="grid grid-cols-1 lg:grid-cols-[0.78fr_1.22fr] gap-10 lg:gap-14 items-center">
            <div className="min-w-0">
              <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-4">
                {t('core.label')}
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-text leading-tight">
                {t('core.title')}
              </h2>
              <p className="mt-5 text-text-secondary text-base leading-8">
                {t('core.subtitle')}
              </p>

              <div className="mt-8 space-y-3">
                {points.map((point) => (
                  <div
                    key={point.labelKey}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/45 px-4 py-3 text-sm text-text"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[rgba(0,122,255,0.10)] text-accent">
                      {point.icon}
                    </span>
                    <span className="leading-6">{t(point.labelKey)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-w-0">
              <div className="absolute -inset-4 rounded-2xl bg-[radial-gradient(circle_at_50%_45%,rgba(0,122,255,0.18),transparent_62%)]" />
              <figure className="relative overflow-hidden rounded-lg border border-border bg-surface-2/60 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
                <img
                  src={ARCHITECTURE_IMAGE}
                  alt={t('core.imageAlt')}
                  className="block w-full h-auto"
                  loading="lazy"
                  decoding="async"
                  onError={(event) => {
                    if (!ASSET_BASE_URL) return
                    if (event.currentTarget.src.endsWith(ARCHITECTURE_FALLBACK_IMAGE)) return
                    event.currentTarget.src = ARCHITECTURE_FALLBACK_IMAGE
                  }}
                />
                <figcaption className="border-t border-border px-5 py-3 text-xs leading-5 text-text-secondary">
                  {t('core.caption')}
                </figcaption>
              </figure>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}
