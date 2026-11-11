import { Fragment, type ReactNode } from "react";
import { parseEmbed } from "@/lib/embeds";
import { BULLET, FENCE, HEADING, INLINE, MEDIA_PATH, ORDERED, QUOTE, RULE, safeHref, STANDALONE_IMAGE, STANDALONE_LINK } from "@/lib/markdown-syntax";

// A small, dependency-free Markdown renderer. It builds React elements (never raw HTML), so post
// text cannot inject markup or scripts. Supports headings, bold, italic, strikethrough, inline code,
// code blocks, links, images, lists, block quotes and rules.

export type MarkdownContext = {
  // Maps an image address to a usable URL, or null to hide the image. The default only accepts
  // this site's own media endpoint, so the post text cannot load images from anywhere else.
  resolveImage?: (src: string) => string | null;
};

const defaultImage = (src: string): string | null => (MEDIA_PATH.test(src) ? src : null);

function link(href: string, children: ReactNode, key: string): ReactNode {
  const safe = safeHref(href);
  if (!safe) return <Fragment key={key}>{children}</Fragment>;
  return (
    <a key={key} href={safe} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-primary underline underline-offset-2">
      {children}
    </a>
  );
}

function image(ctx: MarkdownContext, alt: string, src: string, key: string, block: boolean): ReactNode {
  const url = (ctx.resolveImage ?? defaultImage)(src);
  if (!url) return null;
  const img = (
    // Post images come from this site's media endpoint or an editor preview, so next/image is not needed.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} loading="lazy" className={block ? "h-auto w-full rounded-theme" : "inline-block h-auto max-w-full rounded-theme align-middle"} />
  );
  return block ? (
    <figure key={key} className="space-y-1">
      {img}
      {alt && <figcaption className="text-center text-sm text-muted">{alt}</figcaption>}
    </figure>
  ) : (
    <Fragment key={key}>{img}</Fragment>
  );
}

function renderInline(ctx: MarkdownContext, text: string, keyPrefix = "i"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const key = `${keyPrefix}${index++}`;
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const [, code, bold, bold2, strike, italic, italic2, alt, imageSrc, label, href, bare] = match;
    if (code !== undefined) nodes.push(<code key={key} className="rounded-sm bg-secondary px-1 py-0.5 text-[0.9em]">{code}</code>);
    else if (bold !== undefined || bold2 !== undefined) nodes.push(<strong key={key}>{renderInline(ctx, bold ?? bold2, key)}</strong>);
    else if (strike !== undefined) nodes.push(<del key={key}>{renderInline(ctx, strike, key)}</del>);
    else if (italic !== undefined || italic2 !== undefined) nodes.push(<em key={key}>{renderInline(ctx, italic ?? italic2, key)}</em>);
    else if (alt !== undefined) nodes.push(image(ctx, alt, imageSrc, key, false));
    else if (label !== undefined) nodes.push(link(href, renderInline(ctx, label, key), key));
    else if (bare !== undefined) nodes.push(link(bare, bare, key));
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Single newlines inside a paragraph stay visible as line breaks.
function renderLines(ctx: MarkdownContext, lines: string[], keyPrefix: string): ReactNode[] {
  return lines.flatMap((line, i) => [
    ...(i > 0 ? [<br key={`${keyPrefix}br${i}`} />] : []),
    ...renderInline(ctx, line, `${keyPrefix}l${i}`),
  ]);
}

// Headings start one level down: the page already has its own <h1>.
const HEADING_TAGS = ["h2", "h3", "h4"] as const;
const HEADING_STYLES = ["text-2xl font-bold", "text-xl font-semibold", "text-lg font-semibold"];

export default function Markdown({
  source,
  className,
  resolveImage,
}: {
  source: string;
  className?: string;
  resolveImage?: MarkdownContext["resolveImage"];
}) {
  const ctx: MarkdownContext = { resolveImage };
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
      const Tag = HEADING_TAGS[hashes.length - 1];
      blocks.push(
        <Tag key={id} className={`${HEADING_STYLES[hashes.length - 1]} mt-2`}>
          {renderInline(ctx, content, id)}
        </Tag>,
      );
      i++;
    } else if (STANDALONE_IMAGE.test(line)) {
      const [, alt, src] = line.match(STANDALONE_IMAGE)!;
      blocks.push(image(ctx, alt, src, id, true));
      i++;
    } else if (STANDALONE_LINK.test(line) && parseEmbed(line.match(STANDALONE_LINK)![1] ?? line.match(STANDALONE_LINK)![2])) {
      const match = line.match(STANDALONE_LINK)!;
      const embed = parseEmbed(match[1] ?? match[2])!;
      blocks.push(
        <div key={id} className={embed.ratio === "audio" ? "h-[152px]" : "aspect-video"}>
          <iframe
            src={embed.src}
            title={embed.title}
            loading="lazy"
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            className="h-full w-full rounded-theme border-0"
          />
        </div>,
      );
      i++;
    } else if (RULE.test(line)) {
      blocks.push(<hr key={id} className="border-line" />);
      i++;
    } else if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(lines[i++].match(QUOTE)![1]);
      blocks.push(
        <blockquote key={id} className="border-l-4 border-primary/40 pl-4 italic text-muted">
          {renderLines(ctx, quoted, id)}
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
          {items.map((item, n) => <li key={n}>{renderInline(ctx, item, `${id}-${n}`)}</li>)}
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
        !RULE.test(lines[i]) &&
        !STANDALONE_IMAGE.test(lines[i]) &&
        !(STANDALONE_LINK.test(lines[i]) && parseEmbed(lines[i].match(STANDALONE_LINK)![1] ?? lines[i].match(STANDALONE_LINK)![2]))
      ) {
        paragraph.push(lines[i++]);
      }
      blocks.push(<p key={id}>{renderLines(ctx, paragraph, id)}</p>);
    }
  }

  return <div className={`space-y-3 wrap-break-word ${className ?? ""}`}>{blocks}</div>;
}
