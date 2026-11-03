import { Fragment, type ReactNode } from "react";

// A small, dependency-free Markdown renderer. It builds React elements (never raw HTML), so post
// text cannot inject markup or scripts. Supports headings, bold, italic, strikethrough, inline
// code, code blocks, links, lists, block quotes and rules.

const INLINE =
  /`([^`\n]+)`|\*\*([^\n]+?)\*\*|__([^\n]+?)__|~~([^\n]+?)~~|\*([^*\n]+?)\*|(?<![\w])_([^_\n]+?)_(?![\w])|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g;

function safeHref(href: string): string | null {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function link(href: string, children: ReactNode, key: string): ReactNode {
  const safe = safeHref(href);
  if (!safe) return <Fragment key={key}>{children}</Fragment>;
  return (
    <a key={key} href={safe} target="_blank" rel="noopener noreferrer nofollow ugc" className="underline">
      {children}
    </a>
  );
}

function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const key = `${keyPrefix}${index++}`;
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const [, code, bold, bold2, strike, italic, italic2, label, href, bare] = match;
    if (code !== undefined) nodes.push(<code key={key} className="rounded bg-secondary px-1 py-0.5 text-[0.9em]">{code}</code>);
    else if (bold !== undefined || bold2 !== undefined) nodes.push(<strong key={key}>{renderInline(bold ?? bold2, key)}</strong>);
    else if (strike !== undefined) nodes.push(<del key={key}>{renderInline(strike, key)}</del>);
    else if (italic !== undefined || italic2 !== undefined) nodes.push(<em key={key}>{renderInline(italic ?? italic2, key)}</em>);
    else if (label !== undefined) nodes.push(link(href, renderInline(label, key), key));
    else if (bare !== undefined) nodes.push(link(bare, bare, key));
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Single newlines inside a paragraph stay visible as line breaks.
function renderLines(lines: string[], keyPrefix: string): ReactNode[] {
  return lines.flatMap((line, i) => [
    ...(i > 0 ? [<br key={`${keyPrefix}br${i}`} />] : []),
    ...renderInline(line, `${keyPrefix}l${i}`),
  ]);
}

const HEADING = /^(#{1,3})\s+(.+)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^```/;

export default function Markdown({ source, className }: { source: string; className?: string }) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const id = `b${key++}`;

    if (!line.trim()) {
      i++;
    } else if (FENCE.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={id} className="overflow-x-auto rounded-theme bg-secondary p-3 text-sm">
          <code>{code.join("\n")}</code>
        </pre>,
      );
    } else if (HEADING.test(line)) {
      const [, hashes, content] = line.match(HEADING)!;
      const sizes = ["text-2xl", "text-xl", "text-lg"];
      blocks.push(
        <p key={id} role="heading" aria-level={hashes.length + 2} className={`${sizes[hashes.length - 1]} font-semibold`}>
          {renderInline(content, id)}
        </p>,
      );
      i++;
    } else if (RULE.test(line)) {
      blocks.push(<hr key={id} className="border-line" />);
      i++;
    } else if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(lines[i++].match(QUOTE)![1]);
      blocks.push(
        <blockquote key={id} className="border-l-4 border-line pl-3 text-muted">
          {renderLines(quoted, id)}
        </blockquote>,
      );
    } else if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line) && !BULLET.test(line);
      const pattern = ordered ? ORDERED : BULLET;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) items.push(lines[i++].match(pattern)![1]);
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={id} className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-6`}>
          {items.map((item, n) => <li key={n}>{renderInline(item, `${id}-${n}`)}</li>)}
        </List>,
      );
    } else {
      const paragraph: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !FENCE.test(lines[i]) &&
        !HEADING.test(lines[i]) &&
        !QUOTE.test(lines[i]) &&
        !BULLET.test(lines[i]) &&
        !ORDERED.test(lines[i]) &&
        !RULE.test(lines[i])
      ) {
        paragraph.push(lines[i++]);
      }
      blocks.push(<p key={id}>{renderLines(paragraph, id)}</p>);
    }
  }

  return <div className={`space-y-3 break-words ${className ?? ""}`}>{blocks}</div>;
}
