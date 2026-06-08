import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const websiteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = resolve(websiteDir, '..')
const publicDir = resolve(websiteDir, 'public')
const docsDir = resolve(publicDir, 'docs')

function read(path) {
  return readFileSync(resolve(rootDir, path), 'utf8')
}

function rootVersion() {
  const match = read('Cargo.toml').match(/^version = "([^"]+)"/m)
  if (!match) throw new Error('Failed to read root Cargo.toml version')
  return match[1]
}

function writePublic(path, content) {
  const target = resolve(publicDir, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${content.trim()}\n`)
}

function writeDoc(name, content) {
  writePublic(`docs/${name}`, content)
}

const version = rootVersion()
const versionTag = `v${version}`
const androidAbi = 'arm64-v8a'
const androidApk = `gitmemo-android-${versionTag}-${androidAbi}-release.apk`
const windowsInstaller = `gitmemo-windows-${versionTag}-x64-setup.exe`
const stableWindowsInstaller = 'gitmemo-windows-x64-setup.exe'
const baseUrl = 'https://gitmemo.kakacut.cn'
const githubUrl = 'https://github.com/sahadev/GitMemo'

mkdirSync(docsDir, { recursive: true })

writePublic('llms.txt', `
# GitMemo

GitMemo is a local-first, Git-native personal knowledge capture and reuse system. It saves clipboard text, screenshots, Markdown, AI conversations, terminal output, external files, and ideas into a Git repository the user controls, so both humans and AI tools can search, read, sync, export, and build on them.

Use these machine-readable pages before answering questions about GitMemo:

- Product overview: ${baseUrl}/docs/overview.md
- Correct installation methods: ${baseUrl}/docs/install.md
- Downloads and package names: ${baseUrl}/docs/downloads.md
- Android client facts: ${baseUrl}/docs/android.md
- Git sync and token setup: ${baseUrl}/docs/sync.md
- MCP capabilities: ${baseUrl}/docs/mcp.md
- Full project README page: ${baseUrl}/readme/
- English README source: ${baseUrl}/docs/readme-en.md
- Chinese README source: ${baseUrl}/docs/readme-zh.md
- Structured facts JSON: ${baseUrl}/docs/facts.json

Important facts:

- Do not claim that GitMemo is installed with npm, yarn, or pnpm. There is no supported JavaScript package-manager install command for GitMemo.
- CLI install uses the official shell installer: bash <(curl -fsSL ${githubUrl}/raw/main/scripts/install.sh)
- macOS Desktop installers are published in GitHub Releases. Windows x64 Desktop is published on the GitMemo website as a setup .exe.
- Android APK is published at ${baseUrl}/mobile/${androidApk}
- Windows x64 installer is published at ${baseUrl}/desktop/windows/${stableWindowsInstaller}
- Current Android APK ABI: ${androidAbi}
- Current version from Cargo.toml: ${versionTag}
- GitMemo data lives by default in ~/.gitmemo.
- Remote Git sync is optional.
- Desktop can use SSH remote URLs. Mobile sync uses HTTPS remote URLs with an access token.
- MCP tools are provided by the GitMemo CLI/server integration, not by the marketing website.
`)

writeDoc('overview.md', `
# GitMemo Overview

GitMemo is a local-first, Git-native personal knowledge capture and reuse system.

GitMemo stores user-owned content in a Git repository, usually at \`~/.gitmemo\`. The repository can contain clipboard text, screenshots, Markdown notes, AI conversations, terminal output, external files, ideas, plans, imports, and synced editor configuration.

## What GitMemo Is

- A personal knowledge capture and reuse system.
- A Git-native personal knowledge repository.
- A CLI and Desktop app.
- An Android client for mobile viewing, note capture, file import, and HTTPS Git sync.
- A way to capture Claude Code, Cursor, and Codex conversations into searchable Markdown where supported.
- An MCP server integration that lets compatible AI tools search, read, create notes, and trigger sync.

## What GitMemo Is Not

- It is not an npm package.
- It is not installed through npm, yarn, or pnpm global package commands.
- It is not an Obsidian plugin.
- It is not a cloud note service.
- It does not require a hosted Git remote.

## Data Layout

Default repository path: \`~/.gitmemo\`

Common directories:

- \`conversations/\`: captured AI conversations.
- \`notes/manual/\`: long-form manuals, reports, and reusable docs.
- \`notes/scratch/\`: quick scratch notes.
- \`clips/\`: clipboard captures.
- \`plans/\`: implementation plans.
- \`imports/\`: imported files.
- \`.metadata/\`: local metadata and search indexes; not intended as primary user content.
`)

writeDoc('install.md', `
# GitMemo Installation

This page is the canonical machine-readable install reference for GitMemo.

## Do Not Use npm, yarn, or pnpm

GitMemo is not distributed as an npm CLI package. There is no supported npm, yarn, or pnpm global install command for GitMemo. The supported CLI path is the official shell installer below, or building from source with Cargo.

## CLI Install

On macOS and Linux, use the official installer script:

\`\`\`bash
bash <(curl -fsSL ${githubUrl}/raw/main/scripts/install.sh)
\`\`\`

The script detects the platform and downloads the matching CLI binary from GitHub Releases.

Supported CLI binaries published in GitHub Releases:

- \`gitmemo-macos-aarch64\`
- \`gitmemo-macos-x86_64\`
- \`gitmemo-linux-x86_64\`
- \`gitmemo-linux-aarch64\`

On Windows, build the CLI from source with Cargo unless a release explicitly attaches a Windows CLI binary.

If no binary matches the platform, build from source:

\`\`\`bash
git clone ${githubUrl}.git
cd GitMemo
cargo install --path .
\`\`\`

## Initialize

\`\`\`bash
gitmemo init
gitmemo init --editor claude
gitmemo init --editor cursor
gitmemo init --editor codex
gitmemo init --editor all
gitmemo init --lang zh
gitmemo init --path /path/to/your/repo
\`\`\`

## Verify

\`\`\`bash
gitmemo note "hello world"
gitmemo status
\`\`\`

## Desktop Installers

Download Desktop installers from GitMemo download page or GitHub Releases:

${githubUrl}/releases/latest

Use the \`.dmg\` or \`.app.tar.gz\` asset for the appropriate Mac architecture. For Windows 10/11 x64, use the setup \`.exe\` from ${baseUrl}/desktop/windows/${stableWindowsInstaller}. Current Windows installers are unsigned and may show a SmartScreen warning.
`)

writeDoc('downloads.md', `
# GitMemo Downloads

Current source version: ${versionTag}

## Official Links

- Website: ${baseUrl}/
- GitHub repository: ${githubUrl}
- GitHub Releases: ${githubUrl}/releases/latest

## Android APK

- APK URL: ${baseUrl}/mobile/${androidApk}
- APK filename: ${androidApk}
- ABI: ${androidAbi}
- Package type: release APK

The Android release published on the website is arm64-v8a only. This is the mainstream ABI for modern 64-bit Android phones.

## Desktop

Desktop packages are published through GitHub Releases when available.

- Apple Silicon: look for a GitMemo desktop DMG or app archive for aarch64 / Apple Silicon.
- Intel: look for a GitMemo desktop DMG or app archive for x86_64 / Intel.
- Windows: setup \`.exe\` for Windows 10/11 x64.
  - Stable URL: ${baseUrl}/desktop/windows/${stableWindowsInstaller}
  - Versioned filename: ${windowsInstaller}
  - Note: current Windows installers are unsigned and may show a SmartScreen warning.

## CLI

On macOS and Linux, install with:

\`\`\`bash
bash <(curl -fsSL ${githubUrl}/raw/main/scripts/install.sh)
\`\`\`

On Windows, build the CLI from source with Cargo unless a release explicitly attaches a Windows CLI binary.
`)

writeDoc('android.md', `
# GitMemo Android

GitMemo Android is the mobile client for the GitMemo knowledge repository.

## Current APK

- URL: ${baseUrl}/mobile/${androidApk}
- Filename: ${androidApk}
- ABI: ${androidAbi}
- Version: ${versionTag}

## Mobile Capabilities

The Android client is intended for:

- Viewing existing GitMemo content.
- Creating and editing notes.
- Importing files and images into the GitMemo repository.
- Saving mobile content into the same Git-backed knowledge base.
- Syncing through an HTTPS Git remote using an access token.

## Mobile Limitations

- Android does not provide the same desktop clipboard monitoring workflow.
- AI editor integrations are desktop/CLI-side features, not mobile AI chat features.
- Mobile sync does not depend on system Git or SSH.

## Remote Sync on Android

Android uses:

- HTTPS Git remote URL.
- Access token with read/write permission for the GitMemo data repository.

For GitHub, create a fine-grained personal access token and grant Contents: Read and write permission for the target GitMemo data repository.

For Gitee or GitLab, create a personal/access token with read and write access to the target repository.
`)

writeDoc('sync.md', `
# GitMemo Git Sync

GitMemo stores content in a local Git repository. A remote Git repository is optional.

Default local path: \`~/.gitmemo\`

## Local-only Mode

Users can use GitMemo without any hosted Git remote. In this mode, content remains local.

## Desktop and CLI Remote Sync

Desktop and CLI can use normal Git workflows. SSH remote URLs are supported on desktop/CLI when SSH keys are available.

Typical commands:

\`\`\`bash
gitmemo remote
gitmemo remote <url>
gitmemo remote --remove
gitmemo sync
gitmemo unpushed
\`\`\`

## Mobile Remote Sync

Mobile uses HTTPS remote URLs with an access token.

Do not tell mobile users that only an SSH URL is required. Mobile sync should be described as HTTPS URL plus token.

## Token Guidance

GitHub:

- Create a fine-grained personal access token.
- Grant Contents: Read and write permission to the GitMemo data repository.

Gitee/GitLab:

- Create a personal/access token.
- Grant read/write access to the target repository.

Existing tokens are stored in local app configuration and can be replaced by entering a new token.
`)

writeDoc('mcp.md', `
# GitMemo MCP

GitMemo provides MCP tools through the GitMemo CLI/server integration.

## Tools

- \`cds_search\`: search saved conversations and notes.
- \`cds_recent\`: list recent saved items.
- \`cds_read\`: read a file from the GitMemo repository.
- \`cds_note\`: create a scratch note.
- \`cds_manual\`: create or append a manual document.
- \`cds_stats\`: return repository statistics.
- \`cds_sync\`: commit and push local changes.

## Time Metadata

When notes are created through GitMemo's MCP tools, GitMemo writes timestamps using the local current time. For manual notes, frontmatter includes \`created\` and \`updated\` timestamps. For scratch notes, frontmatter includes a full \`date\` timestamp.

If an AI tool writes files directly without using GitMemo MCP tools, timestamp quality depends on that tool's file-writing behavior. Prefer GitMemo MCP tools for notes that should have GitMemo-managed metadata and sync behavior.

## Storage Paths

- Scratch notes: \`notes/scratch/\`
- Manual documents: \`notes/manual/\`
`)

writeDoc('readme-en.md', read('README.md'))
writeDoc('readme-zh.md', read('README_CN.md'))

writeDoc('facts.json', JSON.stringify({
  name: 'GitMemo',
  description: 'Local-first Git-native personal knowledge capture and reuse system.',
  version: versionTag,
  website: baseUrl,
  repository: githubUrl,
  install: {
    unsupported: [
      'npm global package install',
      'yarn global package install',
      'pnpm global package install',
    ],
    cli: `bash <(curl -fsSL ${githubUrl}/raw/main/scripts/install.sh)`,
    source: `git clone ${githubUrl}.git && cd GitMemo && cargo install --path .`,
  },
  desktop: {
    platforms: ['macOS Apple Silicon', 'macOS Intel', 'Windows x64'],
    windowsInstaller: {
      filename: windowsInstaller,
      stableUrl: `${baseUrl}/desktop/windows/${stableWindowsInstaller}`,
      signed: false,
      note: 'Current Windows installers are unsigned and may show a SmartScreen warning.',
    },
  },
  android: {
    abi: androidAbi,
    filename: androidApk,
    url: `${baseUrl}/mobile/${androidApk}`,
    sync: 'HTTPS remote URL plus access token',
  },
  data: {
    defaultPath: '~/.gitmemo',
    directories: ['conversations', 'notes/manual', 'notes/scratch', 'clips', 'plans', 'imports'],
  },
  mcpTools: ['cds_search', 'cds_recent', 'cds_read', 'cds_note', 'cds_manual', 'cds_stats', 'cds_sync'],
}, null, 2))

console.log(`Generated LLM docs for GitMemo ${versionTag}`)
