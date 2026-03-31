import { MessageSquare, Clipboard, FolderInput, Search, Plug, Zap } from 'lucide-react'
import FeatureCard from '../components/FeatureCard'
import FadeIn from '../components/FadeIn'
import { useI18n } from '../i18n'

export default function Features() {
  const { t } = useI18n()

  const features = [
    { icon: <MessageSquare size={20} />, titleKey: 'feat.conversations.title', descKey: 'feat.conversations.desc' },
    { icon: <Clipboard size={20} />, titleKey: 'feat.clipboard.title', descKey: 'feat.clipboard.desc' },
    { icon: <FolderInput size={20} />, titleKey: 'feat.dragdrop.title', descKey: 'feat.dragdrop.desc' },
    { icon: <Search size={20} />, titleKey: 'feat.search.title', descKey: 'feat.search.desc' },
    { icon: <Plug size={20} />, titleKey: 'feat.mcp.title', descKey: 'feat.mcp.desc' },
    { icon: <Zap size={20} />, titleKey: 'feat.zero.title', descKey: 'feat.zero.desc' },
  ]

  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto">
        <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-4 text-center">{t('feat.label')}</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4">{t('feat.title')}</h2>
        <p className="text-text-secondary text-center max-w-2xl mx-auto mb-16">{t('feat.subtitle')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <FadeIn key={f.titleKey} delay={i * 0.08}>
              <FeatureCard icon={f.icon} title={t(f.titleKey)} description={t(f.descKey)} />
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
