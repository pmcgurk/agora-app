// The Markdown grammar, shared by the blog (components/Markdown.tsx, which builds React elements) and the email
// renderer (lib/markdown-email.ts, which builds inline-styled HTML). Both read a post the same way, so an email never
// disagrees with the page about what is a heading, a list or a link.

export const INLINE =
  /`([^`\n]+)`|\*\*([^\n]+?)\*\*|__([^\n]+?)__|~~([^\n]+?)~~|\*([^*\n]+?)\*|(?<![\w])_([^_\n]+?)_(?![\w])|!\[([^\]\n]*)\]\(([^)\s]+)\)|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g;

export const MEDIA_PATH = /^\/api\/media\/[A-Za-z0-9_-]{1,64}$/;
// A link on a line of its own (bare, or as [text](link)) may become an embedded player.
export const STANDALONE_LINK = /^\s*(?:\[[^\]\n]*\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/\S+))\s*$/;
export const STANDALONE_IMAGE = /^\s*!\[([^\]\n]*)\]\(([^)\s]+)\)\s*$/;

export const HEADING = /^(#{1,3})\s+(.+)$/;
export const BULLET = /^\s*[-*+]\s+(.*)$/;
export const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
export const QUOTE = /^>\s?(.*)$/;
export const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
export const FENCE = /^```/;

export function safeHref(href: string): string | null {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
