// Plain text taken from a post's Markdown, for page descriptions and feeds. Pictures, embeds and markup
// are dropped, so only the words remain.

export function markdownExcerpt(source: string, max = 200): string {
  const text = source
    .replace(/\r\n?/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    // A link on its own line is an embedded video or a picture, not prose.
    .filter((line) => !/^\s*(!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\(https?:[^)]*\)|https?:\/\/\S+)\s*$/.test(line))
    // Heading, quote and list markers belong to the start of a line, so they go before the lines are joined.
    .map((line) => line.replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/, ""))
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\((?:[^()\s]|\([^)]*\))*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/(\*\*|__|~~|\*|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  // End on a word, not in the middle of one.
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 30)).replace(/[\s,;:.-]+$/, "")}…`;
}
