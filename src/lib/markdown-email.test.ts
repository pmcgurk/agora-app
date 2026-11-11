import { describe, expect, it } from "vitest";
import { emailThemeFor } from "@/lib/email-theme";
import { emailImageResolver, renderEmailMarkdown } from "@/lib/markdown-email";

process.env.NEXT_PUBLIC_BASE_URL = "https://blog.example.com";

const theme = emailThemeFor({ themeName: "default" });
const postUrl = "https://blog.example.com/posts/hello";
const render = (source: string, isPublic = true, instancePrivate = false) =>
  renderEmailMarkdown(source, { theme, postUrl, resolveImage: emailImageResolver({ isPublic }, instancePrivate) });

describe("safety", () => {
  it("never lets post text become markup", () => {
    const { html } = render('<script>alert(1)</script> and <img src=x onerror=alert(1)> **<b>bold</b>**');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("does not turn a javascript: link into a link", () => {
    const { html } = render("[click me](javascript:alert(1))");
    expect(html).not.toContain("href=");
    expect(html).toContain("click me");
  });

  it("escapes quotes in link addresses and alt text so they cannot break out of an attribute", () => {
    const { html } = render('![a"onload="x](/api/media/abc)\n\n[t](https://example.com/?q="x)');
    expect(html).not.toMatch(/onload="x"/);
    expect(html).not.toContain('"x)"');
  });

  it("uses inline styles only: email clients ignore classes", () => {
    const { html } = render("# Title\n\nSome *text*\n\n- one\n- two\n\n> quote\n\n---\n\n```\ncode\n```");
    expect(html).not.toContain("class=");
    expect(html).not.toContain("<style");
  });
});

describe("formatting", () => {
  it("reads headings, emphasis, links, lists, quotes and rules like the blog does", () => {
    const { html } = render("## Big\n\nHello **bold** and _soft_ and ~~gone~~ [a link](https://example.com).\n\n1. first\n2. second\n\n> wise words\n\n---");
    expect(html).toContain("<h3");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>soft</em>");
    expect(html).toContain("<del>gone</del>");
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain("<ol");
    expect(html).toContain("<blockquote");
    expect(html).toContain("<hr");
  });

  it("colours things from the theme, not from variables", () => {
    const { html } = render("[link](https://example.com)\n\n> quote");
    expect(html).toContain(`color:${theme.primary}`);
    expect(html).toContain(`border-left:4px solid ${theme.primary}`);
    expect(html).not.toContain("var(--");
  });

  it("keeps single line breaks inside a paragraph", () => {
    expect(render("one\ntwo").html).toContain("one<br>two");
  });

  it("has a plain-text twin with the links spelled out", () => {
    const { text } = render("# Title\n\nRead [the docs](https://example.com/docs) now.\n\n- a\n- b");
    expect(text).toContain("Title");
    expect(text).toContain("Read the docs (https://example.com/docs) now.");
    expect(text).toContain("- a\n- b");
    expect(text).not.toContain("**");
  });
});

describe("pictures and players", () => {
  it("shows a picture of a public post from the public address of this site", () => {
    const { html } = render("![A bowl](/api/media/abc123)");
    expect(html).toContain('<img src="https://blog.example.com/api/media/abc123"');
    expect(html).toContain('alt="A bowl"');
  });

  it("does not load pictures of a members-only post: a mail client has no login", () => {
    const { html, text } = render("![A bowl](/api/media/abc123)", false);
    expect(html).not.toContain("<img");
    expect(html).toContain(postUrl);
    expect(text).toContain(postUrl);
  });

  it("does not load pictures on a private site either", () => {
    expect(render("![A bowl](/api/media/abc123)", true, true).html).not.toContain("<img");
  });

  it("never loads a picture from somewhere else", () => {
    expect(render("![x](https://evil.example/pixel.png)").html).not.toContain("<img");
  });

  it("turns an embedded video into a link, as an email cannot play it", () => {
    const { html, text } = render("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("Watch: YouTube video");
    expect(text).toContain("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });
});

describe("very long posts", () => {
  it("are cut with a link to the rest, instead of being clipped by the mail client", () => {
    const paragraph = `${"word ".repeat(400)}\n\n`;
    const { html } = render(paragraph.repeat(200));
    expect(html.length).toBeLessThan(320_000);
    expect(html).toContain("Continue reading on the site");
  });
});
