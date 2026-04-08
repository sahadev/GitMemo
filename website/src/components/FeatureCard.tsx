import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  title: string
  description: string
}

export default function FeatureCard({ icon, title, description }: Props) {
  return (
    <div className="glass-card p-6 hover:border-[rgba(0,122,255,0.2)] transition-colors duration-300">
      <div className="w-10 h-10 rounded-lg bg-[rgba(0,122,255,0.1)] flex items-center justify-center text-accent mb-4">
        {icon}
      </div>
      <h3 className="text-white font-semibold text-base mb-2">{title}</h3>
      <p className="text-text-secondary text-sm leading-relaxed">{description}</p>
    </div>
  )
}
