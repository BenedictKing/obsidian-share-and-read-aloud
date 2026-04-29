/**
 * Strip Markdown syntax from input, returning readable plain text.
 */
export function normalizeMarkdown(input: string): string {
  let text = input || "";

  // YAML frontmatter
  text = text.replace(/^---\n[\s\S]*?\n---\n?/m, "");
  // HTML comments & Obsidian comments
  text = text.replace(/<!--([\s\S]*?)-->/g, "");
  text = text.replace(/%%([\s\S]*?)%%/g, "");
  // Fenced code blocks & tildes
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/^~~~[\s\S]*?^~~~\s*$/gm, "");
  // Math blocks & inline
  text = text.replace(/^\$\$[\s\S]*?^\$\$\s*$/gm, "");
  text = text.replace(/\$[^\n$]+\$/g, "");
  // Table rows & separator rows
  text = text.replace(/^\|.*\|$/gm, "");
  text = text.replace(/^\|[\s\-|:]+\|$/gm, "");
  // Footnote definitions & references
  text = text.replace(/^\[\^[^\]]+\]:\s*.*$/gm, "");
  text = text.replace(/\[\^[^\]]+\]/g, "");

  // Callouts: keep body text, strip container syntax
  const lines = text.split("\n");
  let inCallout = false;
  text = lines
    .map((line) => {
      if (/^>\s*\[![^\]]*\]\s*/.test(line)) {
        inCallout = true;
        return line.replace(/^>\s*\[![^\]]*\]\s*/, "");
      }
      if (inCallout && /^>\s?/.test(line)) {
        return line.replace(/^>\s?/, "");
      }
      if (inCallout && line.trim() !== "") {
        inCallout = false;
      }
      return line;
    })
    .join("\n");

  // Images
  text = text.replace(/!\[\[([^\]]+)\]\]/g, "");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "");
  // Links: keep display text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Wiki links with alias
  text = text.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2");
  // Wiki links without alias
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  // Bare URLs
  text = text.replace(/https?:\/\/[^\s)]+/g, "");
  // HTML tags
  text = text.replace(/<[^>]+>/g, "");
  // Inline code backticks
  text = text.replace(/`([^`]*)`/g, "$1");
  // Bold & italic & strikethrough & highlight
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");
  text = text.replace(/==([^=]+)==/g, "$1");
  // Blockquotes
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  // Headings
  text = text.replace(/^\s{0,3}(#{1,6})\s+/gm, "");
  // Unordered list markers
  text = text.replace(/^\s*([-+*])\s+/gm, "");
  // Ordered list markers
  text = text.replace(/^\s*\d+[.)]\s+/gm, "");
  // Horizontal rules
  text = text.replace(/^(?:[-*_]\s*){3,}$/gm, "");
  // Obsidian annotations & comments
  text = text.replace(/\{>>.*?<<\}/g, "");
  text = text.replace(/\[\s*@[^\]]+\]/g, "");
  // Collapse whitespace
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
