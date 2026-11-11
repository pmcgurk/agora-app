import type { EmailTheme } from "@/lib/email-theme";
import { parseEmbed } from "@/lib/embeds";
import { escapeHtml as esc } from "@/lib/html-escape";
import { publicUrl } from "@/lib/urls";
import { BULLET, FENCE, HEADING, INLINE, MEDIA_PATH, ORDERED, QUOTE, RULE, safeHref, STANDALONE_IMAGE, STANDALONE_LINK } from "@/lib/markdown-syntax";

// Turns a post's Markdown into email: inline-styled HTML (email clients ignore classes and most stylesheets) and a
// plain-text twin. It reads the post with the same grammar as the blog. Everything is escaped, nothing the author
// types becomes markup, and anything an email cannot do (video players, pictures the reader may not be allowed to
// load) becomes a plain link back to the post.

export type EmailMarkdownOptions = {
  theme: EmailTheme;
  // The post's own address, used when something cannot be shown inside an email.
  postUrl: string;
  // An address a mail client can load for a picture in the post, or null when it cannot (see mediaForEmail).
  resolveImage: (src: string) => string | null;
};

type Rendered = { html: string; text: string };

const MAX_HTML = 300_000;

export function renderEmailMarkdown(source: string, options: EmailMarkdownOptions): Rendered {
  const { theme, postUrl } = options;
  const font = esc(theme.fontBody);
  const heading = esc(theme.fontHeading);
  const radius = `${theme.radiusPx}px`;
  const linkStyle = `color:${esc(theme.primary)};text-decoration:underline`;

  const anchor = (href: string, inner: string) => {
    const safe = safeHref(href);
    return safe ? `<a href="${esc(safe)}" style="${linkStyle}">${inner}</a>` : inner;
  };

  function inline(text: string): Rendered {
    let html = "";
    let plain = "";
    let last = 0;
    for (const match of text.matchAll(INLINE)) {
      if (match.index > last) {
        const chunk = text.slice(last, match.index);
        html += esc(chunk);
        plain += chunk;
      }
      const [, code, bold, bold2, strike, italic, italic2, alt, imageSrc, label, href, bare] = match;
      if (code !== undefined) {
        html += `<code style="background:${esc(theme.secondary)};padding:1px 5px;border-radius:4px;font-family:Consolas,Menlo,monospace;font-size:0.9em">${esc(code)}</code>`;
        plain += code;
      } else if (bold !== undefined || bold2 !== undefined) {
        const inner = inline(bold ?? bold2);
        html += `<strong>${inner.html}</strong>`;
        plain += inner.text;
      } else if (strike !== undefined) {
        const inner = inline(strike);
        html += `<del>${inner.html}</del>`;
        plain += inner.text;
      } else if (italic !== undefined || italic2 !== undefined) {
        const inner = inline(italic ?? italic2);
        html += `<em>${inner.html}</em>`;
        plain += inner.text;
      } else if (alt !== undefined) {
        // A picture in the middle of a sentence is not worth the layout trouble: it stays on the site.
        const url = options.resolveImage(imageSrc);
        html += url ? anchor(url, esc(alt || "picture")) : anchor(postUrl, esc(alt ? `[${alt}]` : "[picture]"));
        plain += alt ? `[${alt}]` : "[picture]";
      } else if (label !== undefined) {
        const inner = inline(label);
        const safe = safeHref(href);
        html += anchor(href, inner.html);
        plain += safe && safe !== label ? `${inner.text} (${safe})` : inner.text;
      } else if (bare !== undefined) {
        html += anchor(bare, esc(bare));
        plain += bare;
      }
      last = match.index + match[0].length;
    }
    if (last < text.length) {
      html += esc(text.slice(last));
      plain += text.slice(last);
    }
    return { html, text: plain };
  }

  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Rendered[] = [];
  const p = `margin:0 0 16px;font-family:${font};font-size:16px;line-height:1.65;color:${esc(theme.text)}`;
  let i = 0;

  const lineBreaks = (chunk: string[]): Rendered => {
    const parts = chunk.map(inline);
    return { html: parts.map((part) => part.html).join("<br>"), text: parts.map((part) => part.text).join("\n") };
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
    } else if (FENCE.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
      i++;
      const body = code.join("\n");
      blocks.push({
        html: `<pre style="margin:0 0 16px;padding:12px 14px;background:${esc(theme.secondary)};color:${esc(theme.text)};border-radius:${radius};font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word">${esc(body)}</pre>`,
        text: body,
      });
    } else if (HEADING.test(line)) {
      const [, hashes, content] = line.match(HEADING)!;
      const level = hashes.length;
      const size = [26, 21, 18][level - 1];
      const inner = inline(content);
      blocks.push({
        html: `<h${level + 1} style="margin:24px 0 10px;font-family:${heading};font-size:${size}px;line-height:1.3;font-weight:700;color:${esc(theme.text)}">${inner.html}</h${level + 1}>`,
        text: inner.text,
      });
      i++;
    } else if (STANDALONE_IMAGE.test(line)) {
      const [, alt, src] = line.match(STANDALONE_IMAGE)!;
      const url = options.resolveImage(src);
      const safe = url ? safeHref(url) : null;
      if (safe) {
        blocks.push({
          html: `<p style="margin:0 0 16px"><img src="${esc(safe)}" alt="${esc(alt)}" width="520" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:${radius}">${alt ? `<span style="display:block;margin-top:6px;text-align:center;font-family:${font};font-size:13px;color:${esc(theme.muted)}">${esc(alt)}</span>` : ""}</p>`,
          text: alt ? `[Image: ${alt}]` : "[Image]",
        });
      } else {
        blocks.push({
          html: `<p style="${p};padding:12px 14px;background:${esc(theme.secondary)};border-radius:${radius};text-align:center">${anchor(postUrl, esc(alt ? `See the picture “${alt}” on the site` : "See the picture on the site"))}</p>`,
          text: `[${alt || "Picture"}: see it on the site] ${postUrl}`,
        });
      }
      i++;
    } else if (STANDALONE_LINK.test(line) && parseEmbed(line.match(STANDALONE_LINK)![1] ?? line.match(STANDALONE_LINK)![2])) {
      const match = line.match(STANDALONE_LINK)!;
      const target = match[1] ?? match[2];
      const embed = parseEmbed(target)!;
      blocks.push({
        html: `<p style="${p};padding:12px 14px;background:${esc(theme.secondary)};border-radius:${radius};text-align:center">${anchor(target, `${embed.ratio === "audio" ? "Listen" : "Watch"}: ${esc(embed.title)}`)}</p>`,
        text: `${embed.title}: ${target}`,
      });
      i++;
    } else if (RULE.test(line)) {
      blocks.push({ html: `<hr style="margin:24px 0;border:0;border-top:1px solid ${esc(theme.border)}">`, text: "-----" });
      i++;
    } else if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) quoted.push(lines[i++].match(QUOTE)![1]);
      const inner = lineBreaks(quoted);
      blocks.push({
        html: `<blockquote style="margin:0 0 16px;padding:2px 0 2px 16px;border-left:4px solid ${esc(theme.primary)};font-family:${font};font-size:16px;line-height:1.65;font-style:italic;color:${esc(theme.muted)}">${inner.html}</blockquote>`,
        text: inner.text.split("\n").map((row) => `> ${row}`).join("\n"),
      });
    } else if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line) && !BULLET.test(line);
      const pattern = ordered ? ORDERED : BULLET;
      const items: Rendered[] = [];
      while (i < lines.length && pattern.test(lines[i])) items.push(inline(lines[i++].match(pattern)![1]));
      const tag = ordered ? "ol" : "ul";
      blocks.push({
        html: `<${tag} style="margin:0 0 16px;padding-left:24px;font-family:${font};font-size:16px;line-height:1.65;color:${esc(theme.text)}">${items.map((item) => `<li style="margin:0 0 4px">${item.html}</li>`).join("")}</${tag}>`,
        text: items.map((item, n) => `${ordered ? `${n + 1}.` : "-"} ${item.text}`).join("\n"),
      });
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
      const inner = lineBreaks(paragraph);
      blocks.push({ html: `<p style="${p}">${inner.html}</p>`, text: inner.text });
    }
  }

  let html = blocks.map((block) => block.html).join("");
  // A very long post is cut rather than risk the message being clipped or rejected; the link goes on in the footer.
  const truncated = html.length > MAX_HTML;
  if (truncated) {
    const kept: string[] = [];
    let size = 0;
    for (const block of blocks) {
      if (size + block.html.length > MAX_HTML) break;
      kept.push(block.html);
      size += block.html.length;
    }
    html = `${kept.join("")}<p style="${p}">${anchor(postUrl, "Continue reading on the site")}</p>`;
  }
  return { html, text: blocks.map((block) => block.text).join("\n\n") };
}

// Which pictures an email may load. A mail client has no login, so only pictures of a public post on a public site
// can be shown; for anything members-only the email links back to the site, where the reader is signed in.
export function emailImageResolver(post: { isPublic: boolean }, instancePrivate: boolean): (src: string) => string | null {
  return (src) => (post.isPublic && !instancePrivate && MEDIA_PATH.test(src) ? publicUrl(src) : null);
}
