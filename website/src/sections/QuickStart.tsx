import { Terminal as TerminalIcon, Apple, MonitorCheck } from 'lucide-react'
import { useI18n } from '../i18n'

export default function QuickStart() {
  const { t } = useI18n()

  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-3xl mx-auto text-center">
        <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-4">{t('start.label')}</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{t('start.title')}</h2>
        <p className="text-text-secondary max-w-xl mx-auto mb-12">{t('start.subtitle')}</p>

        <div className="terminal text-left max-w-xl mx-auto mb-8">
          <div className="terminal-header">
            <div className="terminal-dot" style={{ background: '#ff5f57' }} />
            <div className="terminal-dot" style={{ background: '#febc2e' }} />
            <div className="terminal-dot" style={{ background: '#28c840' }} />
            <span className="ml-3 text-xs text-[#9a9898]">Install</span>
          </div>
          <div className="p-5">
            <p className="text-[#9a9898] text-xs mb-2 font-mono">{t('start.comment')}</p>
            <p className="text-green text-sm font-mono break-all">
              bash &lt;(curl -fsSL https://github.com/sahadev/GitMemo/raw/main/scripts/install.sh)
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mb-12">
          <Step num="1" label={t('start.step1')} />
          <Arrow />
          <Step num="2" label={t('start.step2')} />
          <Arrow />
          <Step num="3" label={t('start.step3')} />
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Badge icon={<Apple size={14} />} label="macOS (Apple Silicon & Intel)" />
          <Badge icon={<MonitorCheck size={14} />} label="Linux (x86_64)" />
          <Badge icon={<TerminalIcon size={14} />} label="CLI + Desktop App" />
        </div>
      </div>
    </section>
  )
}

function Step({ num, label }: { num: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-sm font-bold">{num}</span>
      <span className="text-white text-sm font-medium">{label}</span>
    </div>
  )
}

function Arrow() {
  return <span className="hidden sm:block text-border text-lg">&rarr;</span>
}

function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs text-text-secondary bg-surface border border-border">
      <span className="text-accent">{icon}</span>
      {label}
    </span>
  )
}
