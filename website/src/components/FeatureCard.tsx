import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  title: string
  description: string
  tags?: string[]
}

export default function FeatureCard({ icon, title, description, tags = [] }: Props) {
  return (
    <div className="glass-card p-6 h-full hover:border-[rgba(0,122,255,0.2)] transition-colors duration-300">
      <div className="w-10 h-10 rounded-lg bg-[rgba(0,122,255,0.1)] flex items-center justify-center text-accent mb-4">
        {icon}
      </div>
      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-md border border-border bg-bg px-2 py-1 text-[10px] font-semibold uppercase tracking-normal text-text-secondary">
              {tag}
            </span>
          ))}
        </div>
      )}
      <h3 className="text-text font-semibold text-base mb-2">{title}</h3>
      <p className="text-text-secondary text-sm leading-relaxed">{description}</p>
    </div>
  )
}
