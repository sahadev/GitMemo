import { useState, useEffect, useRef, useCallback, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";

interface MarkdownViewProps {
  content: string;
  /** Relative path of the markdown file (used to resolve sibling images) */
  filePath?: string;
}

type FindWindow = Window & {
  find?: (
    string: string,
    caseSensitive?: boolean,
    backwards?: boolean,
    wrapAround?: boolean,
    wholeWord?: boolean,
    searchInFrames?: boolean,
    showDialog?: boolean,
  ) => boolean;
};

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
    const isRootRelative = src.startsWith("/");
    const isSyncRootPath = /^(clips|imports|notes|conversations|plans|claude-config)\//.test(src);
    const imgRelPath = isRootRelative
      ? src.slice(1)
      : isSyncRootPath
      ? src
      : `${dir}/${src}`;

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
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const findInputRef = useRef<HTMLInputElement>(null);

  // Strip YAML frontmatter
  let body = content;
  if (body.startsWith("---")) {
    const end = body.indexOf("---", 3);
    if (end !== -1) {
      body = body.slice(end + 3).trimStart();
    }
  }

  const runFind = useCallback((backwards = false) => {
    const query = findQuery.trim();
    if (!query) return;
    (window as FindWindow).find?.(query, false, backwards, true, false, true, false);
  }, [findQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "f") return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      setFindOpen(true);
      window.setTimeout(() => findInputRef.current?.focus(), 0);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="markdown-body">
      {findOpen && (
        <div style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          marginBottom: 12,
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "var(--bg-card)",
        }}>
          <Search size={14} style={{ color: "var(--text-secondary)" }} />
          <input
            ref={findInputRef}
            value={findQuery}
            onChange={(e) => {
              setFindQuery(e.target.value);
              window.setTimeout(() => {
                if (e.target.value.trim()) {
                  (window as FindWindow).find?.(e.target.value, false, false, true, false, true, false);
                }
              }, 0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                runFind(e.shiftKey);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setFindOpen(false);
              }
            }}
            placeholder="Find in document"
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
          <button type="button" onClick={() => runFind(true)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}>
            <ChevronUp size={14} />
          </button>
          <button type="button" onClick={() => runFind(false)} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}>
            <ChevronDown size={14} />
          </button>
          <button
            type="button"
            onClick={() => { setFindOpen(false); setFindQuery(""); }}
            style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: (props) => <LocalImage {...props} filePath={filePath} />,
          a: ({ href, children, ...rest }) => (
            <a
              {...rest}
              href={href}
              onClick={(e) => {
                if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
                  e.preventDefault();
                  void openUrl(href);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              {children}
            </a>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
