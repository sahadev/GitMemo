import { isValidElement, useState, useEffect, useRef, useCallback, useMemo, type ComponentProps, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { useAppStore } from "../hooks/useAppStore";
import { useLongPressImageSave } from "../hooks/useLongPressImageSave";
import { shortcutMatches, withDefaultShortcuts } from "../utils/shortcuts";
import { cacheLocalImageDataUrl, getCachedLocalImageDataUrl } from "../utils/localImages";
import { AppIcon } from "./base/AppIcon";

export interface MarkdownViewProps {
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

const frontmatterPattern = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function looksLikeYamlFrontmatter(content: string) {
  const meaningfulLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  return meaningfulLines.length === 0 || meaningfulLines.some((line) => /^[A-Za-z0-9_-]+:\s*/.test(line));
}

function stripFrontmatter(markdown: string) {
  let body = markdown.replace(/^\uFEFF/, "");

  while (true) {
    const match = frontmatterPattern.exec(body);
    if (!match || !looksLikeYamlFrontmatter(match[1])) break;
    body = body.slice(match[0].length);
  }

  return body.trimStart();
}

function hasMarkdownBlockSyntax(line: string) {
  const trimmed = line.trimStart();
  return (
    /^(#{1,6}\s|>|[-+*]\s|\d+[.)]\s|```|~~~)/.test(trimmed) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed) ||
    /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(trimmed)
  );
}

function preserveParagraphLineIndents(markdown: string) {
  // Clipboard/plain-text snippets often use Markdown paragraphs as visual diagrams.
  // Keep that indentation without changing lists, tables, quotes, or code blocks.
  const lines = markdown.split(/\r?\n/);
  const result: string[] = [];
  let block: string[] = [];
  let inFence = false;

  const flushBlock = () => {
    if (block.length === 0) return;

    const hasUnindentedText = block.some((line) => line.trim() && !/^[ \t]/.test(line));
    const hasBlockSyntax = block.some(hasMarkdownBlockSyntax);

    for (const line of block) {
      result.push(
        hasUnindentedText && !hasBlockSyntax
          ? line.replace(/^([ \t]+)(?=\S)/, (spaces) =>
              spaces.replace(/ /g, "&nbsp;").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;")
            )
          : line,
      );
    }

    block = [];
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      flushBlock();
      inFence = !inFence;
      result.push(line);
      continue;
    }

    if (inFence) {
      result.push(line);
      continue;
    }

    if (line.trim() === "") {
      flushBlock();
      result.push(line);
      continue;
    }

    block.push(line);
  }

  flushBlock();
  return result.join("\n");
}

function prepareMarkdown(markdown: string) {
  return preserveParagraphLineIndents(stripFrontmatter(markdown));
}

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

function textFromReactNode(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromReactNode).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textFromReactNode(node.props.children);
  }
  return "";
}

function headingSlug(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~，。、《》？；：‘’“”（）【】！￥…—·、]/g, "");
}

function uniqueHeadingId(text: string, counts: Map<string, number>) {
  const base = headingSlug(text) || "heading";
  const count = counts.get(base) ?? 0;
  counts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function findHeadingByText(root: ParentNode, target: string) {
  const normalizedTarget = safeDecodeURIComponent(target).trim();
  if (!normalizedTarget) return null;

  const headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
  for (const heading of headings) {
    const headingText = heading.textContent?.trim() ?? "";
    if (
      headingText === normalizedTarget ||
      headingSlug(headingText) === headingSlug(normalizedTarget)
    ) {
      return heading as HTMLElement;
    }
  }
  return null;
}

function findFragmentTarget(root: HTMLElement, hash: string) {
  const raw = hash.slice(1);
  if (!raw) return null;

  const decoded = safeDecodeURIComponent(raw);
  const candidates = Array.from(new Set([raw, decoded, headingSlug(decoded)]));

  for (const candidate of candidates) {
    const target = root.querySelector<HTMLElement>(`#${CSS.escape(candidate)}`);
    if (target) return target;
  }

  return findHeadingByText(root, decoded);
}

function scrollToFragment(anchor: HTMLAnchorElement, href: string) {
  const target = findFragmentTarget(anchor.closest(".markdown-body") ?? document.body, href);
  if (!target) return false;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function normalizePathSeparators(value: string) {
  return value.replace(/\\/g, "/");
}

function resolveMarkdownImagePath(src?: string, filePath?: string) {
  if (!src || !filePath) return null;
  const normalizedSrc = normalizePathSeparators(src.trim()).split(/[?#]/, 1)[0];
  if (!normalizedSrc) return null;
  if (/^(https?:|data:|blob:|file:)/i.test(normalizedSrc)) return null;
  if (/^[A-Za-z]:\//.test(normalizedSrc) || normalizedSrc.startsWith("//")) return null;

  const normalizedFilePath = normalizePathSeparators(filePath);
  const slashIndex = normalizedFilePath.lastIndexOf("/");
  const dir = slashIndex >= 0 ? normalizedFilePath.substring(0, slashIndex) : "";
  const isRootRelative = normalizedSrc.startsWith("/");
  const isSyncRootPath = /^(clips|imports|notes|conversations|plans|claude-config)\//.test(normalizedSrc);
  return isRootRelative
    ? normalizedSrc.slice(1)
    : isSyncRootPath
    ? normalizedSrc
    : dir
    ? `${dir}/${normalizedSrc}`
    : normalizedSrc;
}

/**
 * Custom img renderer that loads local images via Tauri's read_file_base64.
 */
function LocalImage({ src, alt, filePath, ...rest }: ComponentProps<"img"> & { filePath?: string }) {
  const imgRelPath = useMemo(() => resolveMarkdownImagePath(src, filePath), [src, filePath]);
  const [dataUrl, setDataUrl] = useState<string | null>(() => imgRelPath ? getCachedLocalImageDataUrl(imgRelPath) : null);
  const [localImageState, setLocalImageState] = useState<"ready" | "loading" | "error">("ready");
  const imageSaveProps = useLongPressImageSave({
    src: dataUrl ?? src ?? null,
    filePath: imgRelPath,
    fileName: src?.split("/").pop() ?? null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!src || !imgRelPath) {
      setDataUrl(null);
      setLocalImageState("ready");
      return;
    }

    const cached = getCachedLocalImageDataUrl(imgRelPath);
    setDataUrl(cached);
    setLocalImageState("loading");
    invoke<string>("read_file_base64", { filePath: imgRelPath })
      .then((b64) => {
        if (cancelled) return;
        setDataUrl(cacheLocalImageDataUrl(imgRelPath, b64));
        setLocalImageState("ready");
      })
      .catch(() => {
        if (!cancelled) setLocalImageState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [src, imgRelPath]);

  const localImageProps = imgRelPath
    ? { "data-gitmemo-local-image-state": localImageState }
    : {};

  if (dataUrl) {
    return <img src={dataUrl} alt={alt ?? ""} {...localImageProps} {...rest} {...imageSaveProps} style={{ ...rest.style, ...imageSaveProps.style }} />;
  }
  if (src?.startsWith("http") || src?.startsWith("data:")) {
    return <img src={src} alt={alt ?? ""} {...rest} {...imageSaveProps} style={{ ...rest.style, ...imageSaveProps.style }} />;
  }
  return <img src={src} alt={alt ?? ""} {...localImageProps} {...rest} {...imageSaveProps} style={{ ...rest.style, ...imageSaveProps.style }} />;
}

export function MarkdownContent({ content, filePath }: MarkdownViewProps) {
  const body = prepareMarkdown(content);
  const headingIdCounts = new Map<string, number>();
  const renderHeading = (Tag: HeadingTag) =>
    ({ children, id, ...rest }: ComponentProps<typeof Tag>) => (
      <Tag {...rest} id={id ?? uniqueHeadingId(textFromReactNode(children), headingIdCounts)}>
        {children}
      </Tag>
    );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: renderHeading("h1"),
        h2: renderHeading("h2"),
        h3: renderHeading("h3"),
        h4: renderHeading("h4"),
        h5: renderHeading("h5"),
        h6: renderHeading("h6"),
        img: (props) => <LocalImage {...props} filePath={filePath} />,
        a: ({ href, children, ...rest }) => (
          <a
            {...rest}
            href={href}
            onClick={(e) => {
              if (href?.startsWith("#")) {
                if (scrollToFragment(e.currentTarget, href)) e.preventDefault();
                return;
              }
              if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
                e.preventDefault();
                void openUrl(href);
              }
            }}
            className="gm-markdown-link"
          >
            {children}
          </a>
        ),
      }}
    >
      {body}
    </ReactMarkdown>
  );
}

export default function MarkdownView({ content, filePath }: MarkdownViewProps) {
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const findInputRef = useRef<HTMLInputElement>(null);
  const imeComposingRef = useRef(false);
  const settings = useAppStore((s) => s.settings);
  const shortcuts = useMemo(() => withDefaultShortcuts(settings?.shortcuts), [settings?.shortcuts]);

  const runFind = useCallback((backwards = false, queryValue = findQuery) => {
    const query = queryValue.trim();
    if (!query) return;
    (window as FindWindow).find?.(query, false, backwards, true, false, true, false);
  }, [findQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !shortcutMatches(e, shortcuts.find_in_document)) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      setFindOpen(true);
      window.setTimeout(() => findInputRef.current?.focus(), 0);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts.find_in_document]);

  return (
    <div className="markdown-body">
      {findOpen && (
        <div className="gm-find-bar">
          <AppIcon icon={Search} size="xs" tone="secondary" />
          <input
            ref={findInputRef}
            value={findQuery}
            onChange={(e) => {
              setFindQuery(e.target.value);
            }}
            onCompositionStart={() => {
              imeComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              imeComposingRef.current = false;
            }}
            onKeyDown={(e) => {
              const ev = e.nativeEvent;
              if (e.key === "Enter" && !imeComposingRef.current && !ev.isComposing && !("keyCode" in ev && (ev as KeyboardEvent).keyCode === 229)) {
                e.preventDefault();
                runFind(e.shiftKey);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setFindOpen(false);
              }
            }}
            placeholder="Find in document"
            className="gm-find-input"
          />
          <button type="button" onClick={() => runFind(true)} className="gm-icon-button">
            <AppIcon icon={ChevronUp} size="xs" />
          </button>
          <button type="button" onClick={() => runFind(false)} className="gm-icon-button">
            <AppIcon icon={ChevronDown} size="xs" />
          </button>
          <button
            type="button"
            onClick={() => { setFindOpen(false); setFindQuery(""); }}
            className="gm-icon-button"
          >
            <AppIcon icon={X} size="xs" />
          </button>
        </div>
      )}
      <MarkdownContent content={content} filePath={filePath} />
    </div>
  );
}
