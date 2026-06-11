import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ReadmeMarkdownProps {
  content: string
  resolveImage?: (src: string | undefined) => string | undefined
  resolveLink: (href: string | undefined) => string | undefined
}

export default function ReadmeMarkdown({ content, resolveImage, resolveLink }: ReadmeMarkdownProps) {
  return (
    <article className="readme-markdown rounded-lg border border-border bg-surface/70 p-5 text-text-secondary shadow-[0_16px_40px_rgba(0,0,0,0.08)] sm:p-8">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => (
            <a href={resolveLink(href)} {...props}>
              {children}
            </a>
          ),
          img: ({ alt, src, ...props }) => (
            <img alt={alt ?? ''} src={resolveImage?.(src) ?? src} {...props} loading="lazy" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  )
}
