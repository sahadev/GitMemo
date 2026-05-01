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
  'hero.subtitle': 'The open-source, local-first alternative to Obsidian and Notion for developers who use AI coding tools.',
  'hero.subtitle2': 'Save Claude Code & Cursor sessions as Markdown in your Git repo. CLI + Desktop. Free forever.',
  'hero.badge': 'Open Source · MIT License',
  'hero.download': 'Download',
  'hero.github': 'View on GitHub',

  // Pain Points
  'pain.label': 'The Problem',
  'pain.title': 'AI knowledge disappears too fast',
  'pain.subtitle': "Every day you generate valuable insights with Claude Code, Cursor, and ChatGPT. But without a system, they're lost the moment you close the chat.",
  'pain.knowledge.title': 'Knowledge Fragmentation',
  'pain.knowledge.desc': 'Deep conversations with Claude Code and Cursor produce invaluable knowledge — problem analyses, architecture decisions, code solutions. But once the chat closes, it all vanishes. No search, no version control, no way to reference it later.',
  'pain.input.title': 'Input Fragmentation',
  'pain.input.desc': "Valuable information is scattered across your browser, clipboard, terminal, and chat apps. You copy dozens of code snippets daily, but there's no unified collector to capture them all.",
  'pain.tool.title': 'Tool Fragmentation',
  'pain.tool.desc': "Obsidian for notes, Notion for projects, Raindrop for bookmarks, Git for code — you're juggling 5+ tools with siloed data. No single tool combines AI chat history, notes, and clipboard into one searchable knowledge base.",

  // Features
  'feat.label': 'Features',
  'feat.title': 'Your personal knowledge base, powered by Git',
  'feat.subtitle': 'Unlike Obsidian, Notion, or Logseq, GitMemo automatically captures your AI coding sessions. Unlike cloud-based tools like Mem.ai or Reflect, your data stays local.',
  'feat.conversations.title': 'Save AI Conversations',
  'feat.conversations.desc': 'Automatically save Claude Code and Cursor sessions as searchable Markdown files. Works like a second brain for your AI coding workflows.',
  'feat.notes.title': 'Built-in Notes (Obsidian-style)',
  'feat.notes.desc': 'Create scratch notes, daily journals, and manuals — all in Markdown, all in the same Git repo. No Electron bloat, no subscription.',
  'feat.clipboard.title': 'Smart Clipboard Manager',
  'feat.clipboard.desc': 'Goes beyond Maccy or Paste — captures clipboard text and images to Git with SHA256 deduplication. Your snippets are version-controlled forever.',
  'feat.search.title': 'Full-text Search',
  'feat.search.desc': 'SQLite FTS5 indexes all your saved conversations, notes, and clips. Find any code snippet or AI insight in milliseconds.',
  'feat.mcp.title': 'MCP Integration',
  'feat.mcp.desc': 'Search your knowledge base, create notes, and access history directly from Claude Code or Cursor via Model Context Protocol — no context switching.',
  'feat.zero.title': 'No Background Daemon',
  'feat.zero.desc': "Uses native editor hooks instead of always-on sync services. Lighter than Obsidian Sync, simpler than Notion's cloud layer.",

  // What Gets Captured
  'capture.label': 'What You Keep',
  'capture.title': 'More than just AI chat export',
  'capture.subtitle': 'While other tools only export conversations, GitMemo builds a complete personal knowledge management system — AI chats, notes, clipboard, plans, and project context in one searchable Git repo.',
  'capture.conversations': 'AI Conversations',
  'capture.conversations.desc': 'Claude Code, Cursor, and AI coding sessions saved as Markdown',
  'capture.notes': 'Developer Notes',
  'capture.notes.desc': 'Scratch notes, daily journals, and technical manuals — like Obsidian but Git-native',
  'capture.plans': 'Plans & Architecture Docs',
  'capture.plans.desc': 'Implementation plans, research notes, and design docs worth keeping',
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
  'how.title': 'Native editor integrations, not a cloud sync layer',
  'how.subtitle': 'Unlike Notion or Mem.ai that lock your data in the cloud, GitMemo uses native CLAUDE.md instructions, PostToolUse hooks, and MCP to keep everything in your local Git repo.',
  'how.step1.title': '1. Install & Init',
  'how.step1.desc': 'One command sets up GitMemo for Claude Code, Cursor, or both. Injects save instructions and MCP tools automatically.',
  'how.step2.title': '2. Auto-capture',
  'how.step2.desc': 'AI conversations are saved as Markdown. Git commits happen automatically. Optional remote push to GitHub, GitLab, or any Git host.',
  'how.step3.title': '3. Search & Reuse',
  'how.step3.desc': 'Full-text search across all your saved knowledge via CLI, Desktop app, or MCP. Like Spotlight for your developer knowledge base.',
  'how.result': 'Result: your AI work stays local, searchable, portable, and version-controlled',

  // Comparison
  'cmp.label': 'Comparison',
  'cmp.title': 'GitMemo vs Obsidian vs Notion vs Logseq',
  'cmp.subtitle': 'The only tool that combines AI conversation capture, Git-native sync, clipboard history, and open source in one package.',
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
  'cmp.products.logseq': 'Logseq',
  'cmp.products.novi': 'Novi Notes',
  'cmp.products.waylog': 'WayLog',
  'cmp.products.gitmemo': 'GitMemo',
  'cmp.note': "GitMemo's unique position:",
  'cmp.note2': 'Auto AI capture + Git-native + Local-first + Open source + Free',

  // Desktop App
  'app.label': 'Desktop App',
  'app.title': 'Lightweight desktop app (16MB, not 200MB)',
  'app.subtitle': 'Built with Tauri + Rust — not Electron. Browse, search, and manage your knowledge base without the bloat of Obsidian or Notion Desktop.',
  'app.tauri': 'Tauri 2.0 — 10x smaller than Electron apps.',
  'app.dashboard': 'Dashboard with stats',
  'app.notes': 'Markdown notes & editor',
  'app.clipboard': 'Clipboard monitor',
  'app.search': 'Full-text search',
  'app.screenshot': 'Screenshot coming soon',

  // Quick Start
  'start.label': 'Get Started',
  'start.title': 'One command to set up',
  'start.subtitle': 'Works with Claude Code, Cursor, or both. Supports macOS, Windows, and Linux. Remote Git sync to GitHub/GitLab/Gitee is optional.',
  'start.comment': '# Install the CLI (macOS / Linux / Windows)',
  'start.step1': 'Install CLI',
  'start.step2': 'Run gitmemo init',
  'start.step3': 'Choose local-only or remote sync (GitHub, GitLab, Gitee)',

  // Footer
  'footer.cta.title': 'Stop losing your AI coding knowledge',
  'footer.cta.subtitle': 'Join developers who save their Claude Code & Cursor conversations, notes, and clipboard to Git. Free and open source forever.',
  'footer.getStarted': 'Get Started',
  'footer.star': 'Star on GitHub',
  'footer.mit': 'Open source under MIT',
}

// ─── Chinese ───────────────────────────────────────────
const zh: Record<string, string> = {
  // Hero
  'hero.title1': '把 AI 对话保存下来',
  'hero.title2': '并写入 Git',
  'hero.subtitle': '面向开发者的开源本地优先知识管理工具，Obsidian 和 Notion 的轻量替代方案。',
  'hero.subtitle2': '自动保存 Claude Code / Cursor 对话为 Markdown，同步到 Git。CLI + Desktop，永久免费。',
  'hero.badge': '开源 · MIT 许可证',
  'hero.download': '下载',
  'hero.github': '在 GitHub 查看',

  // Pain Points
  'pain.label': '痛点',
  'pain.title': 'AI 知识消失得太快了',
  'pain.subtitle': '你每天用 Claude Code、Cursor、ChatGPT 产出大量有价值的知识。但没有系统管理，关掉对话的那一刻就全部丢失。',
  'pain.knowledge.title': '知识碎片化',
  'pain.knowledge.desc': '与 Claude Code 和 Cursor 的深度对话产出大量有价值知识——架构决策、问题分析、代码方案。但对话关闭后这些知识即刻流失，无法搜索、无法版本控制、无法再次引用。',
  'pain.input.title': '信息输入碎片化',
  'pain.input.desc': '有价值的代码片段散布在浏览器、剪贴板、终端、IM 各处。你每天复制大量文本，但没有统一的收集器（Maccy 和 Paste 只是临时缓存，不持久化）。',
  'pain.tool.title': '工具碎片化',
  'pain.tool.desc': 'Obsidian 管笔记、Notion 管项目、Raindrop 管书签、Git 管代码——你在 5+ 个工具间反复跳转。没有一个工具把 AI 对话、笔记和剪贴板统一到一个可搜索的知识库。',

  // Features
  'feat.label': '核心特性',
  'feat.title': '你的个人知识库，以 Git 为底层',
  'feat.subtitle': '不同于 Obsidian/Notion/Logseq 需要手动记录，GitMemo 自动捕获 AI 编程会话。不同于 Mem.ai/Reflect 把数据锁在云端，你的数据完全属于你。',
  'feat.conversations.title': '保存 AI 对话',
  'feat.conversations.desc': '自动保存 Claude Code 和 Cursor 会话为可搜索的 Markdown 文件。就像 AI 编程工作流的第二大脑。',
  'feat.notes.title': '内置笔记（Obsidian 风格）',
  'feat.notes.desc': '便签、日记、技术手册——全部 Markdown，全部在同一个 Git 仓库。无 Electron 臃肿，无订阅费。',
  'feat.clipboard.title': '智能剪贴板管理',
  'feat.clipboard.desc': '超越 Maccy/Paste——把剪贴板文本和图片捕获到 Git，SHA256 去重。你的代码片段被永久版本控制。',
  'feat.search.title': '全文搜索',
  'feat.search.desc': 'SQLite FTS5 为所有对话、笔记和剪贴板建立索引。毫秒级找到任何代码片段或 AI 洞察。',
  'feat.mcp.title': 'MCP 集成',
  'feat.mcp.desc': '通过 Model Context Protocol 直接在 Claude Code 或 Cursor 中搜索知识库、创建笔记——无需切换上下文。',
  'feat.zero.title': '无后台守护进程',
  'feat.zero.desc': '使用编辑器原生 hooks，而不是常驻同步服务。比 Obsidian Sync 更轻，比 Notion 云端更简单。',

  // What Gets Captured
  'capture.label': '你会留下什么',
  'capture.title': '不只是 AI 对话导出',
  'capture.subtitle': '其他工具只能导出对话，GitMemo 构建完整的个人知识管理系统——AI 对话、笔记、剪贴板、计划和项目上下文全部在一个可搜索的 Git 仓库中。',
  'capture.conversations': 'AI 对话',
  'capture.conversations.desc': 'Claude Code、Cursor 等 AI 编程会话，保存为 Markdown',
  'capture.notes': '开发者笔记',
  'capture.notes.desc': '便签、日记、技术手册——像 Obsidian 但 Git 原生',
  'capture.plans': '计划与架构文档',
  'capture.plans.desc': '值得留下的实施方案、调研笔记和设计文档',
  'capture.clipboard': '剪贴板历史',
  'capture.clipboard.desc': '代码片段、URL、图片——持久化到 Git，而不是像 Maccy/Ditto 只做缓存',
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
  'how.subtitle': '不同于 Notion/Mem.ai 把数据锁在云端，GitMemo 使用原生 CLAUDE.md 指令、PostToolUse Hook 和 MCP 把一切保存在本地 Git 仓库。',
  'how.step1.title': '1. 安装初始化',
  'how.step1.desc': '一条命令为 Claude Code、Cursor 或两者完成设置。自动注入保存指令和 MCP 工具。',
  'how.step2.title': '2. 自动捕获',
  'how.step2.desc': 'AI 对话自动保存为 Markdown，Git 自动提交。可选远程推送到 GitHub/GitLab/Gitee。',
  'how.step3.title': '3. 搜索复用',
  'how.step3.desc': '通过 CLI、桌面客户端或 MCP 全文搜索所有已保存的知识。像 Spotlight 一样搜索你的开发者知识库。',
  'how.result': '结果：AI 工作成果本地、可搜索、可迁移、有版本控制',

  // Comparison
  'cmp.label': '竞品对比',
  'cmp.title': 'GitMemo vs Obsidian vs Notion vs Logseq',
  'cmp.subtitle': '唯一一个结合 AI 对话捕获、Git 原生同步、剪贴板历史和开源的工具。',
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
  'cmp.products.logseq': 'Logseq',
  'cmp.products.novi': 'Novi Notes',
  'cmp.products.waylog': 'WayLog',
  'cmp.products.gitmemo': 'GitMemo',
  'cmp.note': 'GitMemo 的独特定位：',
  'cmp.note2': 'AI 自动捕获 + Git 原生 + 本地优先 + 开源 + 免费',

  // Desktop App
  'app.label': '桌面客户端',
  'app.title': '轻量桌面应用（16MB，而非 200MB）',
  'app.subtitle': '基于 Tauri + Rust 构建，不是 Electron。浏览、搜索和管理你的知识库，没有 Obsidian/Notion Desktop 的臃肿。',
  'app.tauri': 'Tauri 2.0——比 Electron 应用小 10 倍。',
  'app.dashboard': '数据仪表盘',
  'app.notes': 'Markdown 笔记 & 编辑器',
  'app.clipboard': '剪贴板监控',
  'app.search': '全文搜索',
  'app.screenshot': '截图即将推出',

  // Quick Start
  'start.label': '快速开始',
  'start.title': '一条命令完成设置',
  'start.subtitle': '支持 Claude Code、Cursor 或两者。支持 macOS、Windows 和 Linux。可选远程同步到 GitHub/GitLab/Gitee。',
  'start.comment': '# 安装 CLI（macOS / Linux / Windows）',
  'start.step1': '安装 CLI',
  'start.step2': '运行 gitmemo init',
  'start.step3': '选择纯本地或远程同步（GitHub、GitLab、Gitee）',

  // Footer
  'footer.cta.title': '别再丢失你的 AI 编程知识',
  'footer.cta.subtitle': '加入那些把 Claude Code / Cursor 对话、笔记和剪贴板保存到 Git 的开发者们。免费且永久开源。',
  'footer.getStarted': '开始使用',
  'footer.star': '在 GitHub Star',
  'footer.mit': '基于 MIT 许可证开源',
}
