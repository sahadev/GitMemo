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
  'hero.title1': 'Auto-sync your AI conversations',
  'hero.title2': 'and notes to Git',
  'hero.subtitle': 'Zero background process. Zero effort.',
  'hero.subtitle2': 'Your data stays in your Git repo — forever.',
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
  'feat.title': 'Everything auto-syncs to Git',
  'feat.subtitle': 'Conversations, clipboard, notes, files — all stored as plain Markdown in your Git repository.',
  'feat.conversations.title': 'Auto-record AI Conversations',
  'feat.conversations.desc': 'Every Claude and Cursor conversation is automatically saved as Markdown — no manual copying required.',
  'feat.clipboard.title': 'Clipboard Capture',
  'feat.clipboard.desc': 'Background clipboard monitoring captures valuable text snippets automatically, deduplicated with SHA256.',
  'feat.dragdrop.title': 'File Drag & Drop',
  'feat.dragdrop.desc': 'Drag any file into the window — Markdown, code, images, PDFs — automatically routed to the right folder.',
  'feat.search.title': 'Full-text Search',
  'feat.search.desc': 'SQLite FTS5 indexes all your content. Search across conversations, notes, and clips instantly.',
  'feat.mcp.title': 'MCP Integration',
  'feat.mcp.desc': 'Unlike Notion MCP (cloud CRUD), GitMemo MCP captures your AI knowledge locally — search history, create notes, sync to Git. Your data never leaves your machine.',
  'feat.zero.title': 'Zero Daemon',
  'feat.zero.desc': "No background process. GitMemo injects into your editor's native hooks — when the editor runs, GitMemo runs.",

  // What Gets Captured
  'capture.label': 'Auto-Capture',
  'capture.title': 'Every AI output, automatically preserved',
  'capture.subtitle': 'GitMemo captures 8 types of knowledge your AI produces — conversations, plans, research, designs, clipboard, files, memory, and skills. All as plain Markdown in Git.',
  'capture.conversations': 'Conversations',
  'capture.conversations.desc': 'Every AI chat, auto-saved as Markdown',
  'capture.plans': 'Plans',
  'capture.plans.desc': 'Implementation plans from Plan Mode',
  'capture.research': 'Research & Analysis',
  'capture.research.desc': 'Competitive analysis, tech research reports',
  'capture.design': 'Design Docs',
  'capture.design.desc': 'Architecture designs, API specs',
  'capture.clipboard': 'Clipboard',
  'capture.clipboard.desc': 'Auto-captured text snippets, code, URLs',
  'capture.imports': 'Imported Files',
  'capture.imports.desc': 'Drag & drop — Markdown, code, PDFs',
  'capture.memory': 'AI Memory',
  'capture.memory.desc': "Claude's auto-memory & project context",
  'capture.skills': 'Skills & Config',
  'capture.skills.desc': 'Custom skills, CLAUDE.md instructions',
  'capture.badge1': 'All plain Markdown',
  'capture.badge2': 'All in Git',
  'capture.badge3': 'All searchable',

  // How It Works
  'how.label': 'How It Works',
  'how.title': 'Parasitic injection, not a daemon',
  'how.subtitle': "GitMemo doesn't run as a background service. It injects into your editor's native infrastructure — three injection points, zero processes.",
  'how.step1.title': 'CLAUDE.md Instruction',
  'how.step1.desc': 'An instruction injected into your CLAUDE.md tells Claude to automatically save every conversation as a Markdown file.',
  'how.step2.title': 'PostToolUse Hook',
  'how.step2.desc': 'A hook in settings.json auto-runs git commit && git push after every file write. Zero manual syncing.',
  'how.step3.title': 'MCP Server',
  'how.step3.desc': 'An MCP server lets Claude search your entire conversation history and create notes — all from within the editor.',
  'how.result': 'Result: All knowledge auto-syncs to your Git repo',

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
  'start.title': 'One command to start',
  'start.subtitle': 'Install GitMemo in 30 seconds. Works with Claude Code, Cursor, or both.',
  'start.comment': '# One-line install (auto-detects platform)',
  'start.step1': 'Install CLI',
  'start.step2': 'gitmemo init',
  'start.step3': 'Done. It just works.',

  // Footer
  'footer.cta.title': 'Stop losing your AI knowledge',
  'footer.cta.subtitle': 'Start auto-syncing today. One command. Free forever.',
  'footer.getStarted': 'Get Started',
  'footer.star': 'Star on GitHub',
  'footer.mit': 'Open source under MIT',
}

// ─── Chinese ───────────────────────────────────────────
const zh: Record<string, string> = {
  // Hero
  'hero.title1': '自动同步你的 AI 对话',
  'hero.title2': '和笔记到 Git',
  'hero.subtitle': '零后台进程，零额外操作。',
  'hero.subtitle2': '数据永远留在你自己的 Git 仓库里。',
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
  'feat.title': '一切自动同步到 Git',
  'feat.subtitle': '对话、剪贴板、笔记、文件——全部以纯 Markdown 格式存储在你的 Git 仓库中。',
  'feat.conversations.title': '自动记录 AI 对话',
  'feat.conversations.desc': 'Claude 和 Cursor 的每次对话自动保存为 Markdown——无需手动复制。',
  'feat.clipboard.title': '剪贴板捕获',
  'feat.clipboard.desc': '后台剪贴板监听自动捕获有价值的文本片段，SHA256 去重。',
  'feat.dragdrop.title': '文件拖拽导入',
  'feat.dragdrop.desc': '拖拽任何文件到窗口——Markdown、代码、图片、PDF——自动路由到正确目录。',
  'feat.search.title': '全文搜索',
  'feat.search.desc': 'SQLite FTS5 索引所有内容，跨对话、笔记、剪贴板即时搜索。',
  'feat.mcp.title': 'MCP 集成',
  'feat.mcp.desc': '不同于 Notion MCP（云端 CRUD），GitMemo MCP 在本地捕获你的 AI 知识——搜索历史、创建笔记、同步到 Git。数据永远不离开你的设备。',
  'feat.zero.title': '零后台进程',
  'feat.zero.desc': '不启动后台服务。GitMemo 注入编辑器的原生 hooks——编辑器运行，GitMemo 就运行。',

  // What Gets Captured
  'capture.label': '自动捕获',
  'capture.title': '每一份 AI 产出，自动留存',
  'capture.subtitle': 'GitMemo 捕获 AI 产出的 8 类知识产物——对话、计划、调研、设计、剪贴板、文件、记忆、技能。全部是 Git 中的纯 Markdown。',
  'capture.conversations': '对话记录',
  'capture.conversations.desc': '每轮 AI 对话，自动保存为 Markdown',
  'capture.plans': '\u8BA1\u5212\u6587\u4EF6',
  'capture.plans.desc': 'Plan Mode 的实施方案',
  'capture.research': '调研 & 分析',
  'capture.research.desc': '竞品分析、技术选型调研报告',
  'capture.design': '设计文档',
  'capture.design.desc': '架构设计、API 设计文档',
  'capture.clipboard': '剪贴板',
  'capture.clipboard.desc': '自动捕获的文本片段、代码、URL',
  'capture.imports': '导入文件',
  'capture.imports.desc': '拖拽导入——Markdown、代码、PDF',
  'capture.memory': 'AI 记忆',
  'capture.memory.desc': 'Claude 的自动记忆和项目上下文',
  'capture.skills': '技能与配置',
  'capture.skills.desc': '自定义技能、CLAUDE.md 指令',
  'capture.badge1': '全部纯 Markdown',
  'capture.badge2': '全部在 Git 中',
  'capture.badge3': '全部可搜索',

  // How It Works
  'how.label': '工作原理',
  'how.title': '寄生注入，不是后台守护进程',
  'how.subtitle': 'GitMemo 不是后台服务，而是注入编辑器的原生基础设施——三个注入点，零进程。',
  'how.step1.title': 'CLAUDE.md 指令',
  'how.step1.desc': '注入到 CLAUDE.md 的指令让 Claude 自动将每次对话保存为 Markdown 文件。',
  'how.step2.title': 'PostToolUse Hook',
  'how.step2.desc': 'settings.json 中的 Hook 在每次文件写入后自动执行 git commit && git push。零手动同步。',
  'how.step3.title': 'MCP Server',
  'how.step3.desc': 'MCP 服务让 Claude 可以搜索你的完整对话历史并创建笔记——全程在编辑器内完成。',
  'how.result': '结果：所有知识自动同步到你的 Git 仓库',

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
  'start.title': '一条命令开始',
  'start.subtitle': '30 秒安装 GitMemo。支持 Claude Code、Cursor 或两者。',
  'start.comment': '# 一键安装（自动检测平台）',
  'start.step1': '安装 CLI',
  'start.step2': 'gitmemo init',
  'start.step3': '完成，开箱即用。',

  // Footer
  'footer.cta.title': '别再丢失你的 AI 知识了',
  'footer.cta.subtitle': '今天就开始自动同步。一条命令，永久免费。',
  'footer.getStarted': '开始使用',
  'footer.star': '在 GitHub Star',
  'footer.mit': '基于 MIT 许可证开源',
}
