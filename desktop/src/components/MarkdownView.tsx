import { useState, useEffect, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { invoke } from "@tauri-apps/api/core";

interface MarkdownViewProps {
  content: string;
  /** Relative path of the markdown file (used to resolve sibling images) */
  filePath?: string;
}

/**
 * Custom img renderer that loads local images via Tauri's read_file_base64.
 */
function LocalImage({ src, alt, filePath, ...rest }: ComponentProps<"img"> & { filePath?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!src || !filePath) return;
    // Only handle relative paths (not http/data URLs)
    if (src.startsWith("http") || src.startsWith("data:")) return;

    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    const imgRelPath = `${dir}/${src}`;

    invoke<string>("read_file_base64", { filePath: imgRelPath })
      .then((b64) => {
        const ext = src.split(".").pop()?.toLowerCase() || "png";
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
        setDataUrl(`data:${mime};base64,${b64}`);
      })
      .catch(() => {});
  }, [src, filePath]);

  if (dataUrl) {
    return <img src={dataUrl} alt={alt ?? ""} {...rest} />;
  }
  if (src?.startsWith("http") || src?.startsWith("data:")) {
    return <img src={src} alt={alt ?? ""} {...rest} />;
  }
  return <img src={src} alt={alt ?? ""} {...rest} />;
}

export default function MarkdownView({ content, filePath }: MarkdownViewProps) {
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
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: (props) => <LocalImage {...props} filePath={filePath} />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
