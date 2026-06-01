import {
  Bot,
  CheckCircle2,
  Clipboard,
  FileDown,
  GitBranch,
  MessageSquare,
  MonitorSmartphone,
  Search,
  Sparkles,
  TerminalSquare,
} from 'lucide-react'
import type { ReactNode } from 'react'
import FadeIn from '../components/FadeIn'
import desktopScreenshot from '../assets/screenshot-20260409-080849.png'
import mobileCompare from '../assets/mobile-desktop-compare-20260524.png'
import { useI18n } from '../i18n/useI18n'

type VisualKind = 'clipboard' | 'terminal' | 'mobile' | 'markdown' | 'aiSave' | 'aiReuse'
type Tone = 'blue' | 'green' | 'amber' | 'violet' | 'rose' | 'slate'

interface Scenario {
  icon: typeof Clipboard
  kickerKey: string
  titleKey: string
  descKey: string
  pointKeys: string[]
  visual: VisualKind
  tone: Tone
}

const toneStyles: Record<Tone, { text: string; bg: string; border: string; surface: string }> = {
  blue: {
    text: 'text-[#007aff]',
    bg: 'bg-[#007aff]/10',
    border: 'border-[#007aff]/25',
    surface: 'bg-[linear-gradient(135deg,rgba(0,122,255,0.13),rgba(48,209,88,0.07),transparent)]',
  },
  green: {
    text: 'text-[#248a3d]',
    bg: 'bg-[#30d158]/12',
    border: 'border-[#30d158]/30',
    surface: 'bg-[linear-gradient(135deg,rgba(48,209,88,0.16),rgba(0,122,255,0.06),transparent)]',
  },
  amber: {
    text: 'text-[#b45309]',
    bg: 'bg-[#f59e0b]/13',
    border: 'border-[#f59e0b]/30',
    surface: 'bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(0,122,255,0.06),transparent)]',
  },
  violet: {
    text: 'text-[#7c3aed]',
    bg: 'bg-[#8b5cf6]/12',
    border: 'border-[#8b5cf6]/30',
    surface: 'bg-[linear-gradient(135deg,rgba(139,92,246,0.16),rgba(0,122,255,0.06),transparent)]',
  },
  rose: {
    text: 'text-[#e11d48]',
    bg: 'bg-[#f43f5e]/10',
    border: 'border-[#f43f5e]/25',
    surface: 'bg-[linear-gradient(135deg,rgba(244,63,94,0.13),rgba(245,158,11,0.08),transparent)]',
  },
  slate: {
    text: 'text-[#64748b]',
    bg: 'bg-[#64748b]/12',
    border: 'border-[#64748b]/25',
    surface: 'bg-[linear-gradient(135deg,rgba(100,116,139,0.14),rgba(139,92,246,0.07),transparent)]',
  },
}

const scenarios: Scenario[] = [
  {
    icon: Clipboard,
    kickerKey: 'scenario.clipboard.kicker',
    titleKey: 'scenario.clipboard.title',
    descKey: 'scenario.clipboard.desc',
    pointKeys: ['scenario.clipboard.point1', 'scenario.clipboard.point2'],
    visual: 'clipboard',
    tone: 'blue',
  },
  {
    icon: TerminalSquare,
    kickerKey: 'scenario.terminal.kicker',
    titleKey: 'scenario.terminal.title',
    descKey: 'scenario.terminal.desc',
    pointKeys: ['scenario.terminal.point1', 'scenario.terminal.point2'],
    visual: 'terminal',
    tone: 'green',
  },
  {
    icon: MonitorSmartphone,
    kickerKey: 'scenario.mobile.kicker',
    titleKey: 'scenario.mobile.title',
    descKey: 'scenario.mobile.desc',
    pointKeys: ['scenario.mobile.point1', 'scenario.mobile.point2'],
    visual: 'mobile',
    tone: 'amber',
  },
  {
    icon: FileDown,
    kickerKey: 'scenario.markdown.kicker',
    titleKey: 'scenario.markdown.title',
    descKey: 'scenario.markdown.desc',
    pointKeys: ['scenario.markdown.point1', 'scenario.markdown.point2'],
    visual: 'markdown',
    tone: 'violet',
  },
  {
    icon: MessageSquare,
    kickerKey: 'scenario.aiSave.kicker',
    titleKey: 'scenario.aiSave.title',
    descKey: 'scenario.aiSave.desc',
    pointKeys: ['scenario.aiSave.point1', 'scenario.aiSave.point2'],
    visual: 'aiSave',
    tone: 'rose',
  },
  {
    icon: Bot,
    kickerKey: 'scenario.aiReuse.kicker',
    titleKey: 'scenario.aiReuse.title',
    descKey: 'scenario.aiReuse.desc',
    pointKeys: ['scenario.aiReuse.point1', 'scenario.aiReuse.point2'],
    visual: 'aiReuse',
    tone: 'slate',
  },
]

function Stage({ children, tone }: { children: ReactNode; tone: Tone }) {
  const style = toneStyles[tone]
  return (
    <div className={`relative min-h-[350px] overflow-hidden rounded-lg border ${style.border} ${style.surface} shadow-[0_26px_80px_rgba(0,0,0,0.13)]`}>
      <div className="absolute inset-0 bg-surface/45" />
      <div className="relative h-full p-4 sm:p-5">{children}</div>
    </div>
  )
}

function WindowChrome({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-[0_18px_45px_rgba(0,0,0,0.12)]">
      <div className="flex h-10 items-center justify-between border-b border-border bg-surface-2 px-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">{label}</span>
      </div>
      {children}
    </div>
  )
}

function ClipboardVisual({ tone }: { tone: Tone }) {
  const style = toneStyles[tone]
  return (
    <Stage tone={tone}>
      <div className="grid min-h-[318px] gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <WindowChrome label="clipboard monitor">
          <div className="space-y-3 p-4">
            {[
              ['Screenshot', 'Screen capture saved', 'bg-[#007aff]/12', 'border-[#007aff]/25'],
              ['Text', 'API note, link, error log', 'bg-[#30d158]/12', 'border-[#30d158]/25'],
              ['Image', 'Reference image archived', 'bg-[#f59e0b]/12', 'border-[#f59e0b]/25'],
            ].map(([title, detail, bg, border]) => (
              <div key={title} className={`rounded-lg border ${border} ${bg} p-3`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-text">{title}</span>
                  <CheckCircle2 size={13} className="text-green" />
                </div>
                <p className="text-[10px] leading-relaxed text-text-secondary">{detail}</p>
              </div>
            ))}
          </div>
        </WindowChrome>

        <div className="flex flex-col justify-center gap-4">
          <div className="rounded-lg border border-border bg-surface p-3 shadow-[0_18px_45px_rgba(0,0,0,0.10)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-text">clips/2026-06</span>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${style.bg} ${style.border} ${style.text}`}>auto saved</span>
            </div>
            <div className="grid grid-cols-[1.2fr_0.8fr] gap-3">
              <img src={desktopScreenshot} alt="" className="h-32 rounded border border-border object-cover object-left-top" />
              <div className="rounded border border-border bg-surface-2 p-3">
                <p className="text-[11px] font-semibold text-text">Copied text</p>
                <p className="mt-2 text-[10px] leading-relaxed text-text-secondary">API note, link, error log, idea...</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface/80 p-3">
            <GitBranch size={15} className={style.text} />
            <span className="text-xs font-medium text-text-secondary">Plain files, searchable history, optional Git sync</span>
          </div>
        </div>
      </div>
    </Stage>
  )
}

function TerminalVisual({ tone }: { tone: Tone }) {
  const style = toneStyles[tone]
  return (
    <Stage tone={tone}>
      <div className="grid min-h-[318px] items-center gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <WindowChrome label="codex terminal">
          <div className="bg-[#101316] p-4 font-mono text-[11px] leading-relaxed text-[#d7f7dd]">
            <p className="text-[#7f8b99]">$ codex</p>
            <p className="mt-4 rounded border border-[#007aff]/30 bg-[#007aff]/25 px-3 py-2 text-[#f7fbff]">
              Select the final answer and copy it into the clipboard.
            </p>
            <p className="mt-4 text-[#9ae6b4]">The saved summary can become a PDF or mobile note later.</p>
            <p className="mt-5 text-[#7f8b99]">✓ copied selection</p>
          </div>
        </WindowChrome>

        <div className="relative">
          <div className={`absolute -left-5 top-1/2 hidden h-px w-10 ${style.bg} lg:block`} />
          <div className="rounded-lg border border-border bg-surface p-5 shadow-[0_18px_45px_rgba(0,0,0,0.12)]">
            <div className="mb-4 flex items-center gap-2">
              <TerminalSquare size={15} className={style.text} />
              <span className="text-xs font-semibold text-text">GitMemo note</span>
            </div>
            <p className="break-words font-mono text-[11px] leading-relaxed text-text-secondary">notes/manual/codex-terminal-answer.md</p>
            <div className="mt-5 space-y-2">
              <div className="h-2 rounded bg-text-secondary/20" />
              <div className="h-2 rounded bg-text-secondary/20" />
              <div className="h-2 w-2/3 rounded bg-text-secondary/20" />
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#8b5cf6]/14 px-2.5 py-1 text-[10px] font-semibold text-[#7c3aed]">Markdown</span>
              <span className="rounded-full bg-[#f59e0b]/15 px-2.5 py-1 text-[10px] font-semibold text-[#b45309]">PDF</span>
              <span className="rounded-full bg-[#30d158]/14 px-2.5 py-1 text-[10px] font-semibold text-[#248a3d]">Mobile</span>
            </div>
          </div>
        </div>
      </div>
    </Stage>
  )
}

function MobileVisual({ tone }: { tone: Tone }) {
  const style = toneStyles[tone]
  return (
    <Stage tone={tone}>
      <div className="relative min-h-[318px]">
        <img
          src={mobileCompare}
          alt=""
          className="h-[318px] w-full rounded-lg border border-border object-cover object-left-top shadow-[0_18px_45px_rgba(0,0,0,0.12)]"
        />
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-lg border border-border bg-surface/90 px-4 py-3 backdrop-blur">
          <span className="text-xs font-semibold text-text">Desktop capture</span>
          <span className={style.text}>→</span>
          <span className="text-xs font-semibold text-text">Android reading</span>
        </div>
      </div>
    </Stage>
  )
}

function MarkdownVisual({ tone }: { tone: Tone }) {
  const style = toneStyles[tone]
  return (
    <Stage tone={tone}>
      <div className="grid min-h-[318px] gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <WindowChrome label="markdown source">
          <div className="bg-[#101316] p-4 font-mono text-[11px] leading-relaxed text-[#cfd7e3]">
            <p className="text-[#f8fafc]"># Project Plan</p>
            <p className="mt-3">- Goal</p>
            <p>- Steps</p>
            <p>- Risks</p>
            <p className="mt-3 text-[#9ae6b4]">```rust</p>
            <p>cargo test</p>
            <p className="text-[#9ae6b4]">```</p>
          </div>
        </WindowChrome>

        <div className="rounded-lg border border-border bg-surface p-5 shadow-[0_18px_45px_rgba(0,0,0,0.12)]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-text">Project Plan</h3>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${style.bg} ${style.border} ${style.text}`}>preview</span>
          </div>
          <p className="text-xs leading-relaxed text-text-secondary">
            A clean Markdown document, ready to read, edit, share, or export.
          </p>
          <div className="mt-5 space-y-2">
            <div className="h-2 rounded bg-text-secondary/20" />
            <div className="h-2 rounded bg-text-secondary/20" />
            <div className="h-2 w-3/4 rounded bg-text-secondary/20" />
          </div>
          <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text">
            <FileDown size={14} className={style.text} />
            Export PDF
          </div>
        </div>
      </div>
    </Stage>
  )
}

function AiSaveVisual({ tone }: { tone: Tone }) {
  const style = toneStyles[tone]
  return (
    <Stage tone={tone}>
      <div className="grid min-h-[318px] items-center gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-3">
          <div className="ml-auto max-w-[88%] rounded-lg bg-accent px-4 py-3 text-sm leading-relaxed text-white shadow-[0_18px_45px_rgba(0,122,255,0.18)]">
            Save this architecture note into GitMemo.
          </div>
          <div className="max-w-[88%] rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-text-secondary">
            Saved to notes/manual/api-cache-design.md
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-[0_18px_45px_rgba(0,0,0,0.12)]">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles size={15} className={style.text} />
            <span className="text-xs font-semibold text-text">Manual document</span>
          </div>
          <div className="space-y-2">
            <div className="h-2 rounded bg-text-secondary/20" />
            <div className="h-2 rounded bg-text-secondary/20" />
            <div className="h-2 w-2/3 rounded bg-text-secondary/20" />
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs text-text-secondary">
            <GitBranch size={14} className={style.text} />
            versioned in Git
          </div>
        </div>
      </div>
    </Stage>
  )
}

function AiReuseVisual({ tone }: { tone: Tone }) {
  const style = toneStyles[tone]
  return (
    <Stage tone={tone}>
      <div className="grid min-h-[318px] gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-[0_18px_45px_rgba(0,0,0,0.12)]">
          <div className="mb-4 flex items-center gap-2">
            <Search size={15} className={style.text} />
            <span className="text-xs font-semibold text-text">Search history</span>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="text-[11px] font-semibold text-text">Old design note</p>
              <p className="mt-1 text-[10px] text-text-secondary">cache strategy, tradeoffs...</p>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="text-[11px] font-semibold text-text">Clipboard clip</p>
              <p className="mt-1 text-[10px] text-text-secondary">error log and fix...</p>
            </div>
          </div>
        </div>
        <div className={`rounded-lg border p-5 shadow-[0_18px_45px_rgba(0,0,0,0.12)] ${style.bg} ${style.border}`}>
          <div className="mb-4 flex items-center gap-2">
            <Bot size={15} className={style.text} />
            <span className="text-xs font-semibold text-text">AI draft</span>
          </div>
          <p className="text-xs leading-relaxed text-text-secondary">
            Based on your saved notes, here is a revised article outline and summary.
          </p>
          <div className="mt-5 space-y-2">
            <div className="h-2 rounded bg-text-secondary/20" />
            <div className="h-2 rounded bg-text-secondary/20" />
            <div className="h-2 w-1/2 rounded bg-text-secondary/20" />
          </div>
        </div>
      </div>
    </Stage>
  )
}

function ScenarioVisual({ kind, tone }: { kind: VisualKind; tone: Tone }) {
  switch (kind) {
    case 'clipboard':
      return <ClipboardVisual tone={tone} />
    case 'terminal':
      return <TerminalVisual tone={tone} />
    case 'mobile':
      return <MobileVisual tone={tone} />
    case 'markdown':
      return <MarkdownVisual tone={tone} />
    case 'aiSave':
      return <AiSaveVisual tone={tone} />
    case 'aiReuse':
      return <AiReuseVisual tone={tone} />
  }
}

export default function ScenarioShowcase() {
  const { t } = useI18n()

  return (
    <section id="scenarios" className="py-24 px-6 border-t border-border scroll-mt-20">
      <div className="mx-auto max-w-6xl">
        <p className="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-accent">{t('scenario.label')}</p>
        <h2 className="mx-auto max-w-4xl text-center text-3xl font-bold text-text sm:text-4xl">{t('scenario.title')}</h2>
        <p className="mx-auto mt-4 max-w-3xl text-center text-text-secondary">{t('scenario.subtitle')}</p>

        <div className="mt-16 space-y-20">
          {scenarios.map((scenario, index) => {
            const Icon = scenario.icon
            const style = toneStyles[scenario.tone]
            const reverse = index % 2 === 1
            return (
              <FadeIn key={scenario.titleKey} delay={0.04 * index}>
                <section className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
                    <div className={reverse ? 'lg:order-2 lg:col-span-7' : 'lg:col-span-7'}>
                      <ScenarioVisual kind={scenario.visual} tone={scenario.tone} />
                    </div>
                    <div className={reverse ? 'lg:order-1 lg:col-span-5 lg:pl-2' : 'lg:col-span-5 lg:pr-2'}>
                      <div className="mb-5 flex items-center gap-3">
                        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-bold ${style.bg} ${style.border} ${style.text}`}>
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${style.bg} ${style.text}`}>
                          <Icon size={14} />
                          {t(scenario.kickerKey)}
                        </span>
                      </div>
                      <h3 className="max-w-xl text-2xl font-bold leading-tight text-text sm:text-3xl">{t(scenario.titleKey)}</h3>
                      <p className="mt-5 max-w-xl text-[15px] leading-8 text-text-secondary">{t(scenario.descKey)}</p>
                      <div className="mt-7 space-y-3">
                        {scenario.pointKeys.map((key) => (
                          <div key={key} className="flex gap-3 text-sm leading-relaxed text-text-secondary">
                            <CheckCircle2 size={16} className={`mt-0.5 shrink-0 ${style.text}`} />
                            <span>{t(key)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                </section>
              </FadeIn>
            )
          })}
        </div>
      </div>
    </section>
  )
}
