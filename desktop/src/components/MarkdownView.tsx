import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownViewProps {
  content: string;
}

export default function MarkdownView({ content }: MarkdownViewProps) {
  // Strip YAML frontmatter
  let body = content;
  if (body.startsWith("---")) {
    const end = body.indexOf("---", 3);
    if (end !== -1) {
      body = body.slice(end + 3).trimStart();
    }
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}
