import { Bot, FileText, GitBranch, Layers3, type LucideIcon } from 'lucide-react'
import FadeIn from '../components/FadeIn'
import { useI18n } from '../i18n/useI18n'

type Tone = 'blue' | 'green' | 'amber' | 'violet'

const toneStyles: Record<Tone, { text: string; bg: string; border: string }> = {
  blue: {
    text: 'text-[#007aff]',
    bg: 'bg-[#007aff]/10',
    border: 'border-[#007aff]/25',
  },
  green: {
    text: 'text-[#248a3d]',
    bg: 'bg-[#30d158]/12',
    border: 'border-[#30d158]/30',
  },
  amber: {
    text: 'text-[#b45309]',
    bg: 'bg-[#f59e0b]/13',
    border: 'border-[#f59e0b]/30',
  },
  violet: {
    text: 'text-[#7c3aed]',
    bg: 'bg-[#8b5cf6]/12',
    border: 'border-[#8b5cf6]/30',
  },
}

interface WhyPoint {
  icon: LucideIcon
  titleKey: string
  descKey: string
  tone: Tone
}

export default function WhyAiEra() {
  const { t } = useI18n()

  const points: WhyPoint[] = [
    { icon: Layers3, titleKey: 'why.point1.title', descKey: 'why.point1.desc', tone: 'blue' },
    { icon: FileText, titleKey: 'why.point2.title', descKey: 'why.point2.desc', tone: 'amber' },
    { icon: GitBranch, titleKey: 'why.point3.title', descKey: 'why.point3.desc', tone: 'green' },
    { icon: Bot, titleKey: 'why.point4.title', descKey: 'why.point4.desc', tone: 'violet' },
  ]

  return (
    <section className="border-t border-border px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-accent">
              {t('why.label')}
            </p>
            <h2 className="text-3xl font-bold leading-tight text-text sm:text-4xl">
              {t('why.title')}
            </h2>
            <p className="mt-5 text-base leading-8 text-text-secondary">
              {t('why.subtitle')}
            </p>
          </div>
        </FadeIn>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {points.map((point, index) => {
            const Icon = point.icon
            const style = toneStyles[point.tone]
            return (
              <FadeIn key={point.titleKey} delay={index * 0.08}>
                <div className={`h-full rounded-lg border ${style.border} bg-bg-card p-6 transition-colors duration-300 hover:border-accent/30`}>
                  <div className="flex items-start gap-4">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${style.bg} ${style.text}`}>
                      <Icon size={19} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-text">{t(point.titleKey)}</h3>
                      <p className="mt-3 text-sm leading-7 text-text-secondary">{t(point.descKey)}</p>
                    </div>
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
