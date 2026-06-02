import { Bot, FileText, GitBranch, Layers3 } from 'lucide-react'
import FadeIn from '../components/FadeIn'
import { useI18n } from '../i18n/useI18n'

export default function WhyAiEra() {
  const { t } = useI18n()

  const points = [
    { icon: Layers3, titleKey: 'why.point1.title', descKey: 'why.point1.desc' },
    { icon: FileText, titleKey: 'why.point2.title', descKey: 'why.point2.desc' },
    { icon: GitBranch, titleKey: 'why.point3.title', descKey: 'why.point3.desc' },
    { icon: Bot, titleKey: 'why.point4.title', descKey: 'why.point4.desc' },
  ]

  return (
    <section className="border-t border-border px-6 py-20">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:gap-14">
        <FadeIn>
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-accent">
              {t('why.label')}
            </p>
            <h2 className="max-w-xl text-3xl font-bold leading-tight text-text sm:text-4xl">
              {t('why.title')}
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-text-secondary">
              {t('why.subtitle')}
            </p>
          </div>
        </FadeIn>

        <div className="space-y-6">
          {points.map((point, index) => {
            const Icon = point.icon
            return (
              <FadeIn key={point.titleKey} delay={index * 0.08}>
                <div className="grid gap-4 border-l border-border pl-5 sm:grid-cols-[2rem_1fr] sm:pl-6">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <Icon size={17} />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-text">{t(point.titleKey)}</h3>
                    <p className="mt-2 text-sm leading-7 text-text-secondary">{t(point.descKey)}</p>
                  </div>
                </div>
              </FadeIn>
            )
          })}
        </div>
      </div>
    </section>
  )
}
