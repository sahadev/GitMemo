import { MessageSquare, FileText, ClipboardList, FolderInput, Brain, Wrench, Target, BarChart3 } from 'lucide-react'
import FadeIn from '../components/FadeIn'

const categories = [
  { icon: <MessageSquare size={18} />, type: 'Conversations', desc: 'Every AI chat, auto-saved as Markdown', dir: 'conversations/', color: '#6366f1' },
  { icon: <Target size={18} />, type: 'Plans', desc: 'Implementation plans from Plan Mode', dir: 'plans/', color: '#8b5cf6' },
  { icon: <BarChart3 size={18} />, type: 'Research & Analysis', desc: 'Competitive analysis, tech research reports', dir: 'notes/manual/', color: '#ec4899' },
  { icon: <FileText size={18} />, type: 'Design Docs', desc: 'Architecture designs, API specs', dir: 'notes/manual/', color: '#f59e0b' },
  { icon: <ClipboardList size={18} />, type: 'Clipboard', desc: 'Auto-captured text snippets, code, URLs', dir: 'clips/', color: '#22c55e' },
  { icon: <FolderInput size={18} />, type: 'Imported Files', desc: 'Drag & drop — Markdown, code, PDFs', dir: 'imports/', color: '#14b8a6' },
  { icon: <Brain size={18} />, type: 'AI Memory', desc: 'Claude\'s auto-memory & project context', dir: 'claude-config/memory/', color: '#f97316' },
  { icon: <Wrench size={18} />, type: 'Skills & Config', desc: 'Custom skills, CLAUDE.md instructions', dir: 'claude-config/skills/', color: '#64748b' },
]

export default function WhatGetsCaptured() {
  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto">
        <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-4 text-center">Auto-Capture</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4">
          Every AI output, automatically preserved
        </h2>
        <p className="text-text-secondary text-center max-w-2xl mx-auto mb-16">
          GitMemo captures 8 types of knowledge your AI produces — conversations, plans, research, designs, clipboard, files, memory, and skills. All as plain Markdown in Git.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat, i) => (
            <FadeIn key={cat.type} delay={i * 0.05}>
              <div className="glass-card p-5 h-full flex flex-col gap-3 hover:border-[rgba(99,102,241,0.2)] transition-colors duration-300">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${cat.color}15`, color: cat.color }}
                  >
                    {cat.icon}
                  </div>
                  <span className="text-white font-semibold text-sm">{cat.type}</span>
                </div>
                <p className="text-text-secondary text-xs leading-relaxed">{cat.desc}</p>
                <code className="text-[10px] text-text-secondary/60 font-mono mt-auto">{cat.dir}</code>
              </div>
            </FadeIn>
          ))}
        </div>

        <div className="flex justify-center mt-10">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-[rgba(99,102,241,0.06)] border border-[rgba(99,102,241,0.15)]">
            <span className="text-accent text-sm font-medium">All plain Markdown</span>
            <span className="text-border">|</span>
            <span className="text-accent text-sm font-medium">All in Git</span>
            <span className="text-border">|</span>
            <span className="text-accent text-sm font-medium">All searchable</span>
          </div>
        </div>
      </div>
    </section>
  )
}
