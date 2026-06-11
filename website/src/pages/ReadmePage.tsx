import { ArrowLeft } from 'lucide-react'
import readmeEn from '../../../README.md?raw'
import readmeZh from '../../../README_CN.md?raw'
import { useI18n } from '../i18n/useI18n'
import ReadmeMarkdown from './ReadmeMarkdown'

const repoBaseUrl = 'https://github.com/sahadev/GitMemo/blob/main/'

function resolveReadmeLink(href: string | undefined) {
  if (!href) return href
  if (/^(https?:|mailto:|#)/.test(href)) return href
  if (href === 'README.md') return '/docs/readme-en.md'
  if (href === 'README_CN.md') return '/docs/readme-zh.md'
  if (href.startsWith('/')) return href
  return `${repoBaseUrl}${href}`
}

function resolveReadmeImage(src: string | undefined) {
  if (!src) return src
  if (/^(https?:|data:|blob:)/.test(src)) return src
  if (src.startsWith('/')) return src
  if (src.startsWith('docs/assets/')) return `/${src}`
  return `${repoBaseUrl}${src}`
}

export default function ReadmePage() {
  const { lang } = useI18n()
  const content = lang === 'zh' ? readmeZh : readmeEn

  return (
    <main className="min-h-screen bg-surface px-4 py-8 text-text sm:px-6">
      <div className="mx-auto max-w-5xl">
        <nav className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text"
          >
            <ArrowLeft size={16} />
            GitMemo
          </a>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/llms.txt"
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text"
            >
              llms.txt
            </a>
            <a
              href="/docs/overview.md"
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text"
            >
              Docs
            </a>
            <a
              href="https://github.com/sahadev/GitMemo#readme"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text"
            >
              <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              GitHub
            </a>
          </div>
        </nav>

        <header className="mb-8">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-accent">
            GitMemo README
          </p>
          <h1 className="text-3xl font-bold text-text sm:text-5xl">
            Project README
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-text-secondary sm:text-base">
            This page renders the repository README content as static HTML so users,
            search engines, and AI crawlers can read the canonical product and
            installation details without inferring them from the landing page.
          </p>
        </header>

        <ReadmeMarkdown
          content={content}
          resolveImage={resolveReadmeImage}
          resolveLink={resolveReadmeLink}
        />
      </div>
    </main>
  )
}
