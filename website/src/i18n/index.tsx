import { createContext, useContext, useState, type ReactNode } from 'react'

export type Lang = 'en' | 'zh'

interface I18nContextType {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextType>(null!)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('gitmemo-lang')
    if (saved === 'zh') return 'zh'
    return 'en'
  })

  const changeLang = (l: Lang) => {
    setLang(l)
    localStorage.setItem('gitmemo-lang', l)
  }

  const t = (key: string): string => {
    const dict = lang === 'zh' ? zh : en
    return (dict as Record<string, string>)[key] ?? key
  }

  return (
    <I18nContext.Provider value={{ lang, setLang: changeLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}

// ─── English ───────────────────────────────────────────
const en: Record<string, string> = {
  // Hero
  'hero.title1': 'Save your AI conversations',
  'hero.title2': 'and notes into Git',
  'hero.subtitle': 'Turn AI conversations, notes, and everyday work into your own Git-backed knowledge repo.',
  'hero.subtitle2': 'CLI + Desktop. Local-first.',
  'hero.badge': 'Open Source · MIT License',
  'hero.download': 'Download',
  'hero.github': 'View on GitHub',

  // Pain Points
  'pain.label': 'The Problem',
  'pain.title': 'AI knowledge disappears too fast',
  'pain.subtitle': "Every day you generate valuable insights with AI. But without a system, they're lost the moment you close the chat.",
  'pain.knowledge.title': 'Knowledge Fragmentation',
  'pain.knowledge.desc': 'Deep conversations with Claude produce invaluable knowledge — problem analyses, solutions, code snippets. But once the chat closes, it all vanishes. No search, no version control, no sharing.',
  'pain.input.title': 'Input Fragmentation',
  'pain.input.desc': "Valuable information is scattered across your browser, clipboard, terminal, and chat apps. You copy dozens of snippets daily, but there's no unified collector.",
  'pain.tool.title': 'Tool Fragmentation',
  'pain.tool.desc': "Obsidian for notes, Notion for projects, browser for bookmarks, Git for code — you're juggling 5+ tools with siloed data. Nothing ties it all together.",

  // Features
  'feat.label': 'Features',
  'feat.title': 'Capture, search, and keep AI work in Git',
  'feat.subtitle': 'GitMemo helps supported Claude Code and Cursor workflows save conversations, notes, and everyday work into your own repo.',
  'feat.conversations.title': 'Save AI Conversations',
  'feat.conversations.desc': 'Claude Code and Cursor sessions can be saved as Markdown through GitMemo’s configured rules and save skills.',
  'feat.clipboard.title': 'Optional Clipboard Capture',
  'feat.clipboard.desc': 'The Desktop app can locally monitor clipboard text and images when you enable it, with SHA256 deduplication.',
  'feat.search.title': 'Full-text Search',
  'feat.search.desc': 'SQLite FTS5 indexes saved conversations, notes, and clips so you can find useful work later.',
  'feat.mcp.title': 'MCP Integration',
  'feat.mcp.desc': 'Search saved history, create notes, and work with GitMemo from your AI editor without moving your content into a hosted knowledge base.',
  'feat.zero.title': 'No Extra Sync Daemon',
  'feat.zero.desc': "Editor capture uses native hooks and integrations instead of a separate always-on sync service.",

  // What Gets Captured
  'capture.label': 'Auto-Capture',
  'capture.title': 'Preserve the AI work you want to reuse',
  'capture.subtitle': 'GitMemo can organize conversations, plans, research notes, designs, clipboard captures, memory, and skills from supported workflows as local files you can search and keep in Git.',
  'capture.conversations': 'Conversations',
  'capture.conversations.desc': 'Every AI chat, auto-saved as Markdown',
  'capture.plans': 'Plans',
  'capture.plans.desc': 'Implementation plans from Plan Mode',
  'capture.research': 'Research & Analysis',
  'capture.research.desc': 'Competitive analysis, tech research reports',
  'capture.design': 'Design Docs',
  'capture.design.desc': 'Architecture designs, API specs',
  'capture.clipboard': 'Clipboard',
  'capture.clipboard.desc': 'Auto-captured text, code, URLs, and images',
  'capture.memory': 'AI Memory',
  'capture.memory.desc': "Claude's auto-memory & project context",
  'capture.skills': 'Skills & Config',
  'capture.skills.desc': 'Custom skills, CLAUDE.md instructions',
  'capture.badge1': 'All plain Markdown',
  'capture.badge2': 'All in Git',
  'capture.badge3': 'All searchable',

  // How It Works
  'how.label': 'How It Works',
  'how.title': 'Native editor integrations, not a cloud sync layer',
  'how.subtitle': 'For Claude Code and Cursor capture flows, GitMemo uses native instructions, hooks, and MCP integrations instead of a separate always-on sync daemon.',
  'how.step1.title': 'Editor Instructions',
  'how.step1.desc': 'GitMemo installs the instructions and save skills that let supported editor workflows write useful conversations to local Markdown files.',
  'how.step2.title': 'Git Sync Hooks',
  'how.step2.desc': 'During setup you choose local-only or optional remote Git sync. For supported flows, GitMemo can wire the hooks or MCP actions that keep saved files tracked in Git.',
  'how.step3.title': 'Searchable Local Layer',
  'how.step3.desc': 'CLI, Desktop, and MCP tools all work on the same local knowledge repo so you can search and reuse saved material later.',
  'how.result': 'Result: useful AI work stays local, searchable, and portable',

  // Comparison
  'cmp.label': 'Comparison',
  'cmp.title': 'How GitMemo compares',
  'cmp.subtitle': 'The only tool that combines auto-collection, Git-native sync, and open source.',
  'cmp.feature': 'Feature',
  'cmp.features.aiBackup': 'AI conversation backup',
  'cmp.features.clipboard': 'Clipboard capture',
  'cmp.features.gitNative': 'Git-native sync',
  'cmp.features.mcp': 'MCP integration',
  'cmp.features.localFirst': 'Local-first / data ownership',
  'cmp.features.openSource': 'Open source',
  'cmp.features.appSize': 'App size',
  'cmp.features.price': 'Price',
  'cmp.products.obsidian': 'Obsidian',
  'cmp.products.notion': 'Notion',
  'cmp.products.novi': 'Novi Notes',
  'cmp.products.gitmemo': 'GitMemo',
  'cmp.note': "GitMemo's unique position:",
  'cmp.note2': 'Auto-collection + Git-native + Local-first + Open source',

  // Desktop App
  'app.label': 'Desktop App',
  'app.title': 'A beautiful desktop companion',
  'app.subtitle': 'Browse, search, and manage all your knowledge from a native desktop app.',
  'app.tauri': 'Built with Tauri — 16MB, not 200MB.',
  'app.dashboard': 'Dashboard with stats',
  'app.notes': 'Notes & editor',
  'app.clipboard': 'Clipboard monitor',
  'app.search': 'Full-text search',
  'app.screenshot': 'Screenshot coming soon',

  // Quick Start
  'start.label': 'Get Started',
  'start.title': 'Set up GitMemo once',
  'start.subtitle': 'Install the CLI, run guided setup, choose Claude Code, Cursor, or both. Desktop currently ships for macOS; remote Git sync is optional.',
  'start.comment': '# Install the CLI (auto-detects platform)',
  'start.step1': 'Install CLI',
  'start.step2': 'Run gitmemo init',
  'start.step3': 'Choose local-only or optional remote sync, then start saving searchable AI work.',

  // Footer
  'footer.cta.title': 'Stop losing useful AI work',
  'footer.cta.subtitle': 'Set up GitMemo once, keep conversations and notes in your own Git-backed repo, and search them later.',
  'footer.getStarted': 'Get Started',
  'footer.star': 'Star on GitHub',
  'footer.mit': 'Open source under MIT',
}

// ─── Chinese ───────────────────────────────────────────
const zh: Record<string, string> = {
  // Hero
  'hero.title1': '把 AI 对话保存下来',
  'hero.title2': '并写入 Git',
  'hero.subtitle': '把 AI 对话、笔记和日常工作产物沉淀到你自己的 Git 知识库。',
  'hero.subtitle2': 'CLI + Desktop，本地优先。',
  'hero.badge': '开源 · MIT 许可证',
  'hero.download': '下载',
  'hero.github': '在 GitHub 查看',

  // Pain Points
  'pain.label': '痛点',
  'pain.title': 'AI 知识消失得太快了',
  'pain.subtitle': '你每天用 AI 产出大量有价值的知识。但没有系统管理，关掉对话的那一刻就全部丢失。',
  'pain.knowledge.title': '知识碎片化',
  'pain.knowledge.desc': '与 Claude 的深度对话产出大量有价值知识——问题分析、解决方案、代码片段。但对话关闭后这些知识即刻流失，无法搜索、无法版本控制。',
  'pain.input.title': '信息输入碎片化',
  'pain.input.desc': '有价值的信息散布在浏览器、剪贴板、终端、IM 各处。你每天复制大量文本，但没有统一的收集器把它们汇聚到一起。',
  'pain.tool.title': '工具碎片化',
  'pain.tool.desc': 'Obsidian 管笔记、Notion 管项目、浏览器管书签、Git 管代码——你在 5+ 个工具间反复跳转，数据孤岛严重。',

  // Features
  'feat.label': '核心特性',
  'feat.title': '把 AI 工作成果留住、可搜索、可归档到 Git',
  'feat.subtitle': 'GitMemo 帮助已支持的 Claude Code 和 Cursor 工作流，把对话、笔记和日常工作产物保存到你自己的仓库里。',
  'feat.conversations.title': '保存 AI 对话',
  'feat.conversations.desc': 'Claude Code 和 Cursor 会话可通过 GitMemo 配置的规则与保存技能写入 Markdown。',
  'feat.clipboard.title': '可选的剪贴板捕获',
  'feat.clipboard.desc': 'Desktop 在你启用后可本地监控剪贴板中的文本和图片，并用 SHA256 去重。',
  'feat.search.title': '全文搜索',
  'feat.search.desc': 'SQLite FTS5 为已保存的对话、笔记和剪贴板建立索引，方便后续查找和复用。',
  'feat.mcp.title': 'MCP 集成',
  'feat.mcp.desc': '直接在 AI 编辑器里搜索历史、创建笔记、配合 GitMemo 工作，而无需把内容迁入托管式知识库。',
  'feat.zero.title': '无需额外同步守护进程',
  'feat.zero.desc': '编辑器侧的捕获依赖原生 hooks 和集成，而不是单独常驻的同步服务。',

  // What Gets Captured
  'capture.label': '自动捕获',
  'capture.title': '把值得复用的 AI 工作成果沉淀下来',
  'capture.subtitle': 'GitMemo 可把已支持工作流中的对话、计划、调研笔记、设计、剪贴板、记忆和技能整理为本地文件，并保持可搜索、可由 Git 管理。',
  'capture.conversations': '对话记录',
  'capture.conversations.desc': '每轮 AI 对话，自动保存为 Markdown',
  'capture.plans': '计划文件',
  'capture.plans.desc': 'Plan Mode 的实施方案',
  'capture.research': '调研 & 分析',
  'capture.research.desc': '竞品分析、技术选型调研报告',
  'capture.design': '设计文档',
  'capture.design.desc': '架构设计、API 设计文档',
  'capture.clipboard': '剪贴板',
  'capture.clipboard.desc': '自动捕获的文本、代码、URL、图片',
  'capture.memory': 'AI 记忆',
  'capture.memory.desc': 'Claude 的自动记忆和项目上下文',
  'capture.skills': '技能与配置',
  'capture.skills.desc': '自定义技能、CLAUDE.md 指令',
  'capture.badge1': '全部纯 Markdown',
  'capture.badge2': '全部在 Git 中',
  'capture.badge3': '全部可搜索',

  // How It Works
  'how.label': '工作原理',
  'how.title': '基于编辑器原生集成，而不是云端同步层',
  'how.subtitle': '对 Claude Code 和 Cursor 的捕获链路，GitMemo 使用原生指令、hooks 和 MCP 集成，而不是额外常驻的同步守护进程。',
  'how.step1.title': '编辑器指令',
  'how.step1.desc': 'GitMemo 会安装相应的指令和保存技能，让已支持的编辑器工作流把有价值的对话写成本地 Markdown 文件。',
  'how.step2.title': 'Git 同步钩子',
  'how.step2.desc': '初始化时你可以选择纯本地或可选远程 Git 同步。对已支持的链路，GitMemo 可接入 hooks 或 MCP 动作，让保存下来的文件被 Git 跟踪。',
  'how.step3.title': '可搜索的本地层',
  'how.step3.desc': 'CLI、Desktop 和 MCP 都面向同一份本地知识库工作，方便你之后搜索和复用保存下来的内容。',
  'how.result': '结果：有价值的 AI 工作成果保留在本地、可搜索、可迁移',

  // Comparison
  'cmp.label': '竞品对比',
  'cmp.title': 'GitMemo 与竞品对比',
  'cmp.subtitle': '唯一一个结合自动收集、Git 原生同步和开源的工具。',
  'cmp.feature': '功能',
  'cmp.features.aiBackup': 'AI 对话自动备份',
  'cmp.features.clipboard': '剪贴板捕获',
  'cmp.features.gitNative': 'Git 原生同步',
  'cmp.features.mcp': 'MCP 集成',
  'cmp.features.localFirst': '本地优先 / 数据所有权',
  'cmp.features.openSource': '开源',
  'cmp.features.appSize': '应用体积',
  'cmp.features.price': '价格',
  'cmp.products.obsidian': 'Obsidian',
  'cmp.products.notion': 'Notion',
  'cmp.products.novi': 'Novi Notes',
  'cmp.products.gitmemo': 'GitMemo',
  'cmp.note': 'GitMemo 的独特定位：',
  'cmp.note2': '自动收集 + Git 原生 + 本地优先 + 开源',

  // Desktop App
  'app.label': '桌面客户端',
  'app.title': '美观的桌面伴侣',
  'app.subtitle': '从原生桌面应用中浏览、搜索和管理你的所有知识。',
  'app.tauri': '基于 Tauri 构建——16MB，不是 200MB。',
  'app.dashboard': '数据仪表盘',
  'app.notes': '笔记 & 编辑器',
  'app.clipboard': '剪贴板监控',
  'app.search': '全文搜索',
  'app.screenshot': '截图即将推出',

  // Quick Start
  'start.label': '快速开始',
  'start.title': '先完成一次设置',
  'start.subtitle': '先安装 CLI，再运行引导式 `gitmemo init`，选择 Claude Code、Cursor 或两者。Desktop 目前提供 macOS 版本；远程 Git 同步可选。',
  'start.comment': '# 安装 CLI（自动检测平台）',
  'start.step1': '安装 CLI',
  'start.step2': '运行 gitmemo init',
  'start.step3': '选择纯本地或可选远程同步，然后开始保存和搜索 AI 工作成果。',

  // Footer
  'footer.cta.title': '别再丢失有价值的 AI 工作成果',
  'footer.cta.subtitle': '完成一次 GitMemo 设置，把对话和笔记留在你自己的 Git 支撑仓库里，并在之后随时搜索。',
  'footer.getStarted': '开始使用',
  'footer.star': '在 GitHub Star',
  'footer.mit': '基于 MIT 许可证开源',
}
