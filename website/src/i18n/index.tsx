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
    const defaultLang = (import.meta.env.VITE_DEFAULT_LANG as Lang) || 'en'
    if (typeof window === 'undefined') return defaultLang
    const saved = localStorage.getItem('gitmemo-lang')
    if (saved === 'zh' || saved === 'en') return saved
    return defaultLang
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
  'hero.title1': 'Markdown notes, AI conversations,',
  'hero.title2': 'all in Git',
  'hero.subtitle': 'A lightweight, open-source Markdown note-taking app and editor for developers.',
  'hero.subtitle2': 'Save Claude Code & Cursor sessions, write notes, manage clipboard — all version-controlled in Git. The Obsidian/Sublime alternative that weighs 16MB.',
  'hero.badge': 'Open Source · MIT License',
  'hero.download': 'Download',
  'hero.github': 'View on GitHub',

  // Pain Points
  'pain.label': 'The Problem',
  'pain.title': 'Your knowledge deserves a better home',
  'pain.subtitle': 'AI conversations vanish when you close the chat. Notes are scattered across apps. Your editor can\'t manage knowledge. There has to be a better way.',
  'pain.knowledge.title': 'AI Knowledge Gets Lost',
  'pain.knowledge.desc': 'Claude Code, Cursor, and ChatGPT sessions produce invaluable knowledge — architecture decisions, debugging solutions, code patterns. But once the chat closes, it all vanishes. No search, no version control, no way to reference it later.',
  'pain.input.title': 'Notes Are Everywhere',
  'pain.input.desc': 'Code snippets in the clipboard, ideas in Apple Notes, docs in Notion or Evernote, bookmarks in Raindrop — your knowledge is scattered across 5+ tools with different subscriptions. You need one place for everything.',
  'pain.tool.title': 'Cloud Notes Lock Your Data',
  'pain.tool.desc': 'Evernote and cloud note apps charge monthly fees and lock your data behind proprietary formats. Sublime Text and VS Code are great editors but can\'t manage notes. Obsidian handles notes but ignores AI conversations. No tool does it all — for free.',

  // Features
  'feat.label': 'Features',
  'feat.title': 'Notes + Editor + AI capture, unified in Git',
  'feat.subtitle': 'GitMemo combines the note-taking power of Obsidian, the editing speed of Sublime Text, and AI conversation capture — all in a 16MB app backed by Git.',
  'feat.conversations.title': 'Save AI Conversations',
  'feat.conversations.desc': 'Automatically save Claude Code and Cursor sessions as searchable Markdown. Works like a second brain for your AI coding workflows.',
  'feat.notes.title': 'Markdown Notes & Editor',
  'feat.notes.desc': 'Create scratch notes, daily journals, and manuals with a fast Markdown editor. Like Obsidian meets Sublime Text — lightweight, Git-native, no subscription.',
  'feat.clipboard.title': 'Smart Clipboard Manager',
  'feat.clipboard.desc': 'Goes beyond Maccy or Paste — captures clipboard text and images to Git with SHA256 deduplication. Your snippets are version-controlled forever.',
  'feat.search.title': 'Full-text Search',
  'feat.search.desc': 'SQLite FTS5 indexes all your saved conversations, notes, and clips. Find any code snippet or AI insight in milliseconds — faster than Spotlight.',
  'feat.mcp.title': 'MCP Integration',
  'feat.mcp.desc': 'Search your knowledge base, create notes, and access history directly from Claude Code or Cursor via Model Context Protocol — no context switching.',
  'feat.zero.title': 'No Background Daemon',
  'feat.zero.desc': 'Uses native editor hooks instead of always-on sync services. Lighter than Obsidian Sync, simpler than Notion\'s cloud, faster than Typora.',

  // What Gets Captured
  'capture.label': 'What You Keep',
  'capture.title': 'Everything a developer needs, in one repo',
  'capture.subtitle': 'GitMemo isn\'t just an AI chat exporter — it\'s a complete Markdown-based knowledge management system. Notes, conversations, clipboard, plans, and project context in one searchable Git repo.',
  'capture.conversations': 'AI Conversations',
  'capture.conversations.desc': 'Claude Code, Cursor, and AI coding sessions saved as Markdown',
  'capture.notes': 'Markdown Notes',
  'capture.notes.desc': 'Scratch notes, daily journals, and technical docs — like Obsidian but Git-native, like Typora but with search',
  'capture.plans': 'Plans & Architecture Docs',
  'capture.plans.desc': 'Implementation plans, research notes, and design docs — write them right in the built-in editor',
  'capture.clipboard': 'Clipboard History',
  'capture.clipboard.desc': 'Code snippets, URLs, images — persisted to Git, not just cached like Maccy or Ditto',
  'capture.context': 'AI Project Context',
  'capture.context.desc': 'Claude/Cursor memory, rules, skills, and CLAUDE.md configs synced into your knowledge repo',
  'capture.imports': 'Imported Files',
  'capture.imports.desc': 'Drag-and-drop files with automatic routing — code, docs, images all organized',
  'capture.badge1': 'All plain Markdown',
  'capture.badge2': 'All in Git',
  'capture.badge3': 'All searchable',

  // How It Works
  'how.label': 'How It Works',
  'how.title': 'Native integrations, not a cloud sync layer',
  'how.subtitle': 'Unlike Notion or Mem.ai that lock your data in the cloud, GitMemo uses native CLAUDE.md instructions, PostToolUse hooks, and MCP to keep everything in your local Git repo.',
  'how.step1.title': '1. Install & Init',
  'how.step1.desc': 'One command sets up GitMemo for Claude Code, Cursor, or both. Injects save instructions and MCP tools automatically.',
  'how.step2.title': '2. Write & Capture',
  'how.step2.desc': 'Write notes in the built-in Markdown editor. AI conversations are auto-saved. Clipboard is auto-captured. Git commits happen automatically.',
  'how.step3.title': '3. Search & Reuse',
  'how.step3.desc': 'Full-text search across all your knowledge via CLI, Desktop app, or MCP. Like Spotlight for your developer knowledge base.',
  'how.result': 'Result: your notes and AI work stay local, searchable, portable, and version-controlled',

  // Comparison
  'cmp.label': 'Comparison',
  'cmp.title': 'GitMemo vs Evernote vs Obsidian vs Notion vs Sublime Text',
  'cmp.subtitle': 'The only tool that combines Markdown editing, AI conversation capture, clipboard history, Git-native sync, and open source. A true alternative to cloud note apps.',
  'cmp.feature': 'Feature',
  'cmp.features.aiBackup': 'AI conversation capture',
  'cmp.features.notes': 'Markdown notes & editor',
  'cmp.features.clipboard': 'Clipboard capture',
  'cmp.features.gitNative': 'Git-native sync',
  'cmp.features.mcp': 'MCP integration',
  'cmp.features.localFirst': 'Local-first / offline',
  'cmp.features.openSource': 'Open source',
  'cmp.features.appSize': 'App size',
  'cmp.features.price': 'Price',
  'cmp.products.evernote': 'Evernote',
  'cmp.products.obsidian': 'Obsidian',
  'cmp.products.notion': 'Notion',
  'cmp.products.sublime': 'Sublime Text',
  'cmp.products.typora': 'Typora',
  'cmp.products.gitmemo': 'GitMemo',
  'cmp.note': 'GitMemo\'s unique position:',
  'cmp.note2': 'Notes + Editor + AI capture + Git-native + Open source + Free + No subscription',

  // Desktop App
  'app.label': 'Desktop App',
  'app.title': 'Lightweight desktop app (16MB, not 200MB)',
  'app.subtitle': 'Built with Tauri + Rust — not Electron. A Markdown editor and note manager that\'s 10x smaller than Obsidian, Notion Desktop, or Sublime Text.',
  'app.tauri': 'Tauri 2.0 — 10x smaller than Electron apps.',
  'app.dashboard': 'Dashboard with stats',
  'app.notes': 'Markdown editor & notes',
  'app.clipboard': 'Clipboard monitor',
  'app.search': 'Full-text search',
  'app.screenshot': 'Screenshot coming soon',

  // Quick Start
  'start.label': 'Get Started',
  'start.title': 'One command to set up',
  'start.subtitle': 'Works with Claude Code, Cursor, or standalone as a note-taking app. Supports macOS, Windows, and Linux. Remote Git sync to GitHub/GitLab/Gitee is optional.',
  'start.comment': '# Install the CLI (macOS / Linux / Windows)',
  'start.step1': 'Install CLI',
  'start.step2': 'Run gitmemo init',
  'start.step3': 'Choose local-only or remote sync (GitHub, GitLab, Gitee)',

  // Footer
  'footer.cta.title': 'Your notes and AI knowledge, finally in one place',
  'footer.cta.subtitle': 'Join developers who use GitMemo as their daily Markdown editor, note-taking app, and AI conversation archive. Free and open source forever.',
  'footer.getStarted': 'Get Started',
  'footer.star': 'Star on GitHub',
  'footer.mit': 'Open source under MIT',
}

// ─── Chinese ───────────────────────────────────────────
const zh: Record<string, string> = {
  // Hero
  'hero.title1': 'Markdown 笔记、AI 对话',
  'hero.title2': '全部存入 Git',
  'hero.subtitle': '面向开发者的轻量开源 Markdown 笔记应用和编辑器。',
  'hero.subtitle2': '自动保存 Claude Code / Cursor 对话，内置笔记编辑器，剪贴板捕获——全部 Git 版本控制。Obsidian / Sublime Text / Typora 的 16MB 开源替代。',
  'hero.badge': '开源 · MIT 许可证',
  'hero.download': '下载',
  'hero.github': '在 GitHub 查看',

  // Pain Points
  'pain.label': '痛点',
  'pain.title': '你的知识值得一个更好的归宿',
  'pain.subtitle': 'AI 对话关掉就没了，笔记散落在各种工具里，编辑器不能管理知识。总得有个更好的办法。',
  'pain.knowledge.title': 'AI 知识白白丢失',
  'pain.knowledge.desc': 'Claude Code、Cursor、ChatGPT 的深度对话产出大量有价值知识——架构决策、调试方案、代码模式。但对话关闭后即刻流失，无法搜索、无法版本控制、无法再次引用。',
  'pain.input.title': '笔记散落各处',
  'pain.input.desc': '代码片段在剪贴板，想法在备忘录，文档在印象笔记/有道云笔记，书签在浏览器——你的知识分散在 5 个以上工具中，每个还要交订阅费。你需要一个统一的免费工具。',
  'pain.tool.title': '云笔记锁住你的数据',
  'pain.tool.desc': '印象笔记/有道云笔记按月收费，数据锁在私有格式里无法导出。Sublime Text、VS Code 写代码好用但不能管笔记。Obsidian/思源笔记管笔记但忽略 AI 对话。没有工具同时免费做到这些。',

  // Features
  'feat.label': '核心特性',
  'feat.title': '笔记 + 编辑器 + AI 捕获，统一在 Git',
  'feat.subtitle': 'GitMemo 把 Obsidian 的笔记管理、Sublime Text 的编辑速度、Typora 的 Markdown 体验、和 AI 对话自动捕获结合到一个 16MB 的 Git 原生应用。',
  'feat.conversations.title': '保存 AI 对话',
  'feat.conversations.desc': '自动保存 Claude Code 和 Cursor 会话为可搜索的 Markdown。AI 编程工作流的第二大脑。',
  'feat.notes.title': 'Markdown 笔记编辑器',
  'feat.notes.desc': '内置快速 Markdown 编辑器，创建便签、日记、技术手册。像 Obsidian 一样管理笔记，像 Sublime/Typora 一样轻快——Git 原生，无订阅费。',
  'feat.clipboard.title': '智能剪贴板管理',
  'feat.clipboard.desc': '超越 Maccy/Paste——把剪贴板文本和图片捕获到 Git，SHA256 去重。你的代码片段被永久版本控制。',
  'feat.search.title': '全文搜索',
  'feat.search.desc': 'SQLite FTS5 为所有对话、笔记和剪贴板建立索引，支持中文搜索。毫秒级找到任何代码片段或 AI 洞察。',
  'feat.mcp.title': 'MCP 集成',
  'feat.mcp.desc': '通过 Model Context Protocol 直接在 Claude Code 或 Cursor 中搜索知识库、创建笔记——无需切换上下文。',
  'feat.zero.title': '无后台守护进程',
  'feat.zero.desc': '使用编辑器原生 hooks，不需要常驻同步服务。比 Obsidian Sync 更轻，比语雀/Notion 云端更简单，比思源笔记更小巧。',

  // What Gets Captured
  'capture.label': '你会留下什么',
  'capture.title': '开发者需要的一切，在一个仓库中',
  'capture.subtitle': 'GitMemo 不只是 AI 对话导出器——它是一个完整的 Markdown 知识管理系统。笔记、对话、剪贴板、计划和项目上下文全部在一个可搜索的 Git 仓库。',
  'capture.conversations': 'AI 对话',
  'capture.conversations.desc': 'Claude Code、Cursor 等 AI 编程会话，保存为 Markdown',
  'capture.notes': '开发者笔记',
  'capture.notes.desc': '便签、日记、技术手册——像 Obsidian 但 Git 原生，像 Typora 但带搜索',
  'capture.plans': '计划与架构文档',
  'capture.plans.desc': '实施方案、调研笔记和设计文档——直接在内置编辑器中撰写',
  'capture.clipboard': '剪贴板历史',
  'capture.clipboard.desc': '代码片段、URL、图片——持久化到 Git，不像 Maccy/Ditto 只做缓存',
  'capture.context': 'AI 项目上下文',
  'capture.context.desc': 'Claude/Cursor 的 memory、rules、skills 和 CLAUDE.md 配置同步到知识库',
  'capture.imports': '导入文件',
  'capture.imports.desc': '拖拽导入文件自动路由——代码、文档、图片各归其位',
  'capture.badge1': '全部纯 Markdown',
  'capture.badge2': '全部在 Git 中',
  'capture.badge3': '全部可搜索',

  // How It Works
  'how.label': '工作原理',
  'how.title': '基于编辑器原生集成，而不是云端同步层',
  'how.subtitle': '不同于语雀/飞书文档/Notion 把数据锁在云端，GitMemo 使用原生 CLAUDE.md 指令、PostToolUse Hook 和 MCP 把一切保存在本地 Git 仓库。',
  'how.step1.title': '1. 安装初始化',
  'how.step1.desc': '一条命令为 Claude Code、Cursor 或两者完成设置。自动注入保存指令和 MCP 工具。',
  'how.step2.title': '2. 写作与捕获',
  'how.step2.desc': '在内置 Markdown 编辑器中写笔记。AI 对话自动保存，剪贴板自动捕获，Git 自动提交。',
  'how.step3.title': '3. 搜索复用',
  'how.step3.desc': '通过 CLI、桌面客户端或 MCP 全文搜索所有已保存的知识。像 Spotlight 一样搜索你的开发者知识库。',
  'how.result': '结果：AI 工作成果本地、可搜索、可迁移、有版本控制',

  // Comparison
  'cmp.label': '竞品对比',
  'cmp.title': 'GitMemo vs 印象笔记 vs Obsidian vs 有道云笔记',
  'cmp.subtitle': '唯一一个同时覆盖 Markdown 编辑、AI 对话捕获、剪贴板历史、Git 原生同步和开源的笔记工具。印象笔记/有道云笔记/Obsidian/Typora 用户的免费开源替代。',
  'cmp.feature': '功能',
  'cmp.features.aiBackup': 'AI 对话自动备份',
  'cmp.features.notes': 'Markdown 笔记 & 编辑器',
  'cmp.features.clipboard': '剪贴板捕获',
  'cmp.features.gitNative': 'Git 原生同步',
  'cmp.features.mcp': 'MCP 集成',
  'cmp.features.localFirst': '本地优先 / 数据所有权',
  'cmp.features.openSource': '开源',
  'cmp.features.appSize': '应用体积',
  'cmp.features.price': '价格',
  'cmp.products.evernote': '印象笔记',
  'cmp.products.obsidian': 'Obsidian',
  'cmp.products.notion': 'Notion',
  'cmp.products.sublime': 'Sublime Text',
  'cmp.products.typora': 'Typora',
  'cmp.products.gitmemo': 'GitMemo',
  'cmp.note': 'GitMemo 的独特定位：',
  'cmp.note2': '笔记 + 编辑器 + AI 捕获 + Git 原生 + 开源 + 免费 + 无订阅',

  // Desktop App
  'app.label': '桌面客户端',
  'app.title': '轻量桌面应用（16MB，而非 200MB）',
  'app.subtitle': '基于 Tauri + Rust 构建，不是 Electron。一个 Markdown 编辑器兼笔记管理器，比 Obsidian、Notion Desktop、Sublime Text 小 10 倍。',
  'app.tauri': 'Tauri 2.0——比 Electron 应用小 10 倍。',
  'app.dashboard': '数据仪表盘',
  'app.notes': 'Markdown 笔记 & 编辑器',
  'app.clipboard': '剪贴板监控',
  'app.search': '全文搜索',
  'app.screenshot': '截图即将推出',

  // Quick Start
  'start.label': '快速开始',
  'start.title': '一条命令完成设置',
  'start.subtitle': '支持 Claude Code、Cursor 或作为独立笔记应用使用。支持 macOS、Windows 和 Linux。可选远程同步到 GitHub/GitLab/Gitee。',
  'start.comment': '# 安装 CLI（macOS / Linux / Windows）',
  'start.step1': '安装 CLI',
  'start.step2': '运行 gitmemo init',
  'start.step3': '选择纯本地或远程同步（GitHub、GitLab、Gitee）',

  // Footer
  'footer.cta.title': '笔记、AI 对话、知识管理，终于有了统一的归宿',
  'footer.cta.subtitle': '加入那些用 GitMemo 作为日常 Markdown 编辑器、笔记应用和 AI 对话归档工具的开发者。免费且永久开源。',
  'footer.getStarted': '开始使用',
  'footer.star': '在 GitHub Star',
  'footer.mit': '基于 MIT 许可证开源',
}
