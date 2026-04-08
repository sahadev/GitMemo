import { MessageSquare, FileText, ClipboardList, FolderInput, Brain, Wrench, Target, BarChart3 } from 'lucide-react'
import FadeIn from '../components/FadeIn'
import { useI18n } from '../i18n'

export default function WhatGetsCaptured() {
  const { t } = useI18n()

  const categories = [
    { icon: <MessageSquare size={18} />, typeKey: 'capture.conversations', descKey: 'capture.conversations.desc', dir: 'conversations/', color: '#007aff' },
    { icon: <Target size={18} />, typeKey: 'capture.plans', descKey: 'capture.plans.desc', dir: 'plans/', color: '#8b5cf6' },
    { icon: <BarChart3 size={18} />, typeKey: 'capture.research', descKey: 'capture.research.desc', dir: 'notes/manual/', color: '#ec4899' },
    { icon: <FileText size={18} />, typeKey: 'capture.design', descKey: 'capture.design.desc', dir: 'notes/manual/', color: '#f59e0b' },
    { icon: <ClipboardList size={18} />, typeKey: 'capture.clipboard', descKey: 'capture.clipboard.desc', dir: 'clips/', color: '#30d158' },
    { icon: <FolderInput size={18} />, typeKey: 'capture.imports', descKey: 'capture.imports.desc', dir: 'imports/', color: '#14b8a6' },
    { icon: <Brain size={18} />, typeKey: 'capture.memory', descKey: 'capture.memory.desc', dir: 'claude-config/memory/', color: '#f97316' },
    { icon: <Wrench size={18} />, typeKey: 'capture.skills', descKey: 'capture.skills.desc', dir: 'claude-config/skills/', color: '#64748b' },
  ]

  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto">
        <p className="text-accent text-sm font-semibold tracking-wider uppercase mb-4 text-center">{t('capture.label')}</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4">{t('capture.title')}</h2>
        <p className="text-text-secondary text-center max-w-2xl mx-auto mb-16">{t('capture.subtitle')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat, i) => (
            <FadeIn key={cat.typeKey} delay={i * 0.05}>
              <div className="glass-card p-5 h-full flex flex-col gap-3 hover:border-[rgba(0,122,255,0.2)] transition-colors duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cat.color}15`, color: cat.color }}>
                    {cat.icon}
                  </div>
                  <span className="text-white font-semibold text-sm">{t(cat.typeKey)}</span>
                </div>
                <p className="text-text-secondary text-xs leading-relaxed">{t(cat.descKey)}</p>
                <code className="text-[10px] text-text-secondary/60 font-mono mt-auto">{cat.dir}</code>
              </div>
            </FadeIn>
          ))}
        </div>

        <div className="flex justify-center mt-10">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-[rgba(0,122,255,0.06)] border border-[rgba(0,122,255,0.15)]">
            <span className="text-accent text-sm font-medium">{t('capture.badge1')}</span>
            <span className="text-border">|</span>
            <span className="text-accent text-sm font-medium">{t('capture.badge2')}</span>
            <span className="text-border">|</span>
            <span className="text-accent text-sm font-medium">{t('capture.badge3')}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
