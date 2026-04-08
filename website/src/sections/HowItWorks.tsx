import { FileText, GitCommit, Search } from 'lucide-react'
import { useI18n } from '../i18n'

const steps = [
  {
    icon: <FileText size={24} />,
    num: '01',
    titleKey: 'how.step1.title',
    descKey: 'how.step1.desc',
    code: '# CLAUDE.md\nAfter each conversation, save it as:\n~/.gitmemo/conversations/{date}-{topic}.md',
  },
  {
    icon: <GitCommit size={24} />,
    num: '02',
    titleKey: 'how.step2.title',
    descKey: 'how.step2.desc',
    code: '// settings.json → hooks\n"PostToolUse": [{\n  "command": "gitmemo sync"\n}]',
  },
  {
    icon: <Search size={24} />,
    num: '03',
    titleKey: 'how.step3.title',
    descKey: 'how.step3.desc',
    code: '> Claude, search my conversations\n  about "async Rust"\n\n  Found 3 results...',
  },
]

export default function HowItWorks() {
  const { t } = useI18n()

  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto">
        <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-4 text-center">{t('how.label')}</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4">{t('how.title')}</h2>
        <p className="text-text-secondary text-center max-w-2xl mx-auto mb-16">{t('how.subtitle')}</p>

        <div className="space-y-8">
          {steps.map((step) => (
            <div key={step.num} className="glass-card p-8 flex flex-col md:flex-row gap-8 items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-accent font-mono text-sm font-bold">{step.num}</span>
                  <div className="w-10 h-10 rounded-lg bg-[rgba(0,122,255,0.1)] flex items-center justify-center text-accent">{step.icon}</div>
                  <h3 className="text-white font-semibold text-lg">{t(step.titleKey)}</h3>
                </div>
                <p className="text-text-secondary text-sm leading-relaxed pl-[52px]">{t(step.descKey)}</p>
              </div>
              <div className="w-full md:w-80 shrink-0">
                <div className="terminal text-xs">
                  <div className="terminal-header">
                    <div className="terminal-dot" style={{ background: '#ff5f57' }} />
                    <div className="terminal-dot" style={{ background: '#febc2e' }} />
                    <div className="terminal-dot" style={{ background: '#28c840' }} />
                  </div>
                  <pre className="p-4 text-[#9a9898] whitespace-pre-wrap leading-5">{step.code}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center mt-8">
          <div className="flex items-center gap-3 px-5 py-2 rounded-full bg-[rgba(48,209,88,0.1)] border border-[rgba(48,209,88,0.2)]">
            <div className="w-2 h-2 rounded-full bg-green" />
            <span className="text-green text-sm font-medium">{t('how.result')}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
