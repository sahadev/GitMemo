import { useEffect, useRef, useState } from 'react'

const lines = [
  { text: '$ gitmemo init', color: '#fdfcfc', delay: 0 },
  { text: '', color: '', delay: 600 },
  { text: '  Setting up GitMemo...', color: '#007aff', delay: 800 },
  { text: '  Editor: Claude Code + Cursor', color: '#9a9898', delay: 1200 },
  { text: '  Language: English', color: '#9a9898', delay: 1500 },
  { text: '', color: '', delay: 1700 },
  { text: '  [1/3] Injecting CLAUDE.md instruction...    done', color: '#30d158', delay: 1900 },
  { text: '  [2/3] Registering PostToolUse hook...       done', color: '#30d158', delay: 2400 },
  { text: '  [3/3] Configuring MCP server...             done', color: '#30d158', delay: 2900 },
  { text: '', color: '', delay: 3100 },
  { text: '  GitMemo is ready! Your AI conversations will auto-sync to Git.', color: '#007aff', delay: 3300 },
]

export default function Terminal() {
  const [visibleLines, setVisibleLines] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    lines.forEach((line, i) => {
      setTimeout(() => setVisibleLines(i + 1), line.delay)
    })
  }, [])

  return (
    <div className="terminal max-w-2xl mx-auto text-left" ref={ref}>
      <div className="terminal-header">
        <div className="terminal-dot" style={{ background: '#ff5f57' }} />
        <div className="terminal-dot" style={{ background: '#febc2e' }} />
        <div className="terminal-dot" style={{ background: '#28c840' }} />
        <span className="ml-3 text-xs text-[#9a9898]">Terminal</span>
      </div>
      <div className="p-5 text-sm leading-6 min-h-[280px]">
        {lines.slice(0, visibleLines).map((line, i) => (
          <div key={i} style={{ color: line.color || 'transparent' }}>
            {line.text || '\u00A0'}
          </div>
        ))}
        {visibleLines < lines.length && (
          <span className="cursor-blink text-[#fdfcfc]">_</span>
        )}
      </div>
    </div>
  )
}
