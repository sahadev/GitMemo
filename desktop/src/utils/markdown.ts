export function stripMarkdownFrontmatter(content: string) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, "").trim();
}

export function replaceMarkdownBody(content: string, body: string) {
  const normalizedBody = body.endsWith("\n") ? body : `${body}\n`;
  const frontmatter = content.match(/^---\r?\n[\s\S]*?\r?\n---/);
  if (!frontmatter) return normalizedBody;
  return `${frontmatter[0]}\n\n${normalizedBody}`;
}
