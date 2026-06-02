import { Bot, Clipboard, FileDown, Files, FileText, GitBranch, MonitorSmartphone, Search, Star } from 'lucide-react'
import FeatureCard from '../components/FeatureCard'
import FadeIn from '../components/FadeIn'
import { useI18n } from '../i18n/useI18n'

export default function Features() {
  const { t } = useI18n()

  const features = [
    { icon: <Clipboard size={20} />, titleKey: 'cap.clipboard.title', descKey: 'cap.clipboard.desc', tagKeys: ['platform.desktop'] },
    { icon: <FileText size={20} />, titleKey: 'cap.markdown.title', descKey: 'cap.markdown.desc', tagKeys: ['platform.desktop', 'platform.android'] },
    { icon: <Star size={20} />, titleKey: 'cap.favorite.title', descKey: 'cap.favorite.desc', tagKeys: ['platform.desktop', 'platform.android'] },
    { icon: <Search size={20} />, titleKey: 'cap.search.title', descKey: 'cap.search.desc', tagKeys: ['platform.desktop', 'platform.cli', 'platform.mcp', 'platform.android'] },
    { icon: <MonitorSmartphone size={20} />, titleKey: 'cap.sync.title', descKey: 'cap.sync.desc', tagKeys: ['platform.desktop', 'platform.cli', 'platform.android'] },
    { icon: <Files size={20} />, titleKey: 'cap.files.title', descKey: 'cap.files.desc', tagKeys: ['platform.desktop', 'platform.android'] },
    { icon: <FileDown size={20} />, titleKey: 'cap.pdf.title', descKey: 'cap.pdf.desc', tagKeys: ['platform.desktop'] },
    { icon: <Bot size={20} />, titleKey: 'cap.ai.title', descKey: 'cap.ai.desc', tagKeys: ['platform.cli', 'platform.mcp'] },
    { icon: <GitBranch size={20} />, titleKey: 'cap.git.title', descKey: 'cap.git.desc', tagKeys: ['platform.desktop', 'platform.cli', 'platform.android'] },
  ]

  return (
    <section id="features" className="py-24 px-6 border-t border-border scroll-mt-20">
      <div className="max-w-5xl mx-auto">
        <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-4 text-center">{t('feat.label')}</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-text text-center mb-4">{t('feat.title')}</h2>
        <p className="text-text-secondary text-center max-w-2xl mx-auto mb-16">{t('feat.subtitle')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <FadeIn key={f.titleKey} delay={i * 0.08}>
              <FeatureCard icon={f.icon} title={t(f.titleKey)} description={t(f.descKey)} tags={f.tagKeys.map((key) => t(key))} />
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
