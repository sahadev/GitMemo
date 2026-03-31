import { Brain, Layers, Puzzle } from 'lucide-react'
import FadeIn from '../components/FadeIn'
import { useI18n } from '../i18n'

export default function PainPoints() {
  const { t } = useI18n()

  const problems = [
    { icon: <Brain size={24} />, titleKey: 'pain.knowledge.title', descKey: 'pain.knowledge.desc' },
    { icon: <Layers size={24} />, titleKey: 'pain.input.title', descKey: 'pain.input.desc' },
    { icon: <Puzzle size={24} />, titleKey: 'pain.tool.title', descKey: 'pain.tool.desc' },
  ]

  return (
    <section className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-4 text-center">{t('pain.label')}</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4">{t('pain.title')}</h2>
        <p className="text-text-secondary text-center max-w-2xl mx-auto mb-16">{t('pain.subtitle')}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {problems.map((p, i) => (
            <FadeIn key={p.titleKey} delay={i * 0.1}>
              <div className="glass-card p-8 h-full">
                <div className="w-12 h-12 rounded-xl bg-[rgba(239,68,68,0.1)] flex items-center justify-center text-red-400 mb-5">
                  {p.icon}
                </div>
                <h3 className="text-white font-semibold text-lg mb-3">{t(p.titleKey)}</h3>
                <p className="text-text-secondary text-sm leading-relaxed">{t(p.descKey)}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
