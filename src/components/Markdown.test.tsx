import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Markdown from "@/components/Markdown";

const render = (source: string) => renderToStaticMarkup(<Markdown source={source} />);

describe("Markdown: untrusted text stays inert", () => {
  it("escapes raw HTML instead of passing it through", () => {
    const html = render('<script>alert(1)</script> <img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops links with dangerous schemes but keeps their text", () => {
    const html = render("[click me](javascript:alert(1)) and [data](data:text/html;base64,AAAA)");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text");
    expect(html).toContain("click me");
  });

  it("opens ordinary links safely in a new tab", () => {
    const html = render("[docs](https://example.com/page)");
    expect(html).toContain('href="https://example.com/page"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
    expect(html).toContain("nofollow");
    expect(html).toContain("ugc");
  });

  it("links bare addresses, without swallowing trailing punctuation", () => {
    const html = render("See https://example.com/a, then stop.");
    expect(html).toContain('href="https://example.com/a"');
  });

  it("only shows images from this site's own media endpoint", () => {
    expect(render("![](https://evil.example/tracker.png)")).not.toContain("<img");
    expect(render("![](//evil.example/tracker.png)")).not.toContain("<img");
    expect(render("![alt](/api/media/abc123_-X)")).toContain('src="/api/media/abc123_-X"');
    expect(render("![](/api/media/../../etc/passwd)")).not.toContain("<img");
  });
});

describe("Markdown: embeds", () => {
  it("turns an allowed video link on its own line into a sandboxed player", () => {
    const html = render("Watch this:\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n\nBye");
    expect(html).toContain("<iframe");
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain("sandbox=");
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"');
  });

  it("works for the [text](link) form too", () => {
    expect(render("[my video](https://vimeo.com/123456789)")).toContain("player.vimeo.com/video/123456789");
  });

  it("leaves a video link inside a sentence as an ordinary link", () => {
    const html = render("I loved https://youtu.be/dQw4w9WgXcQ so much");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("<a ");
  });

  it("never frames a site that is not on the allowlist", () => {
    const html = render("https://evil.example/embed/whatever");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("<a ");
  });
});

describe("Markdown: formatting", () => {
  it("starts headings one level down, because the page already has an h1", () => {
    const html = render("# Big\n\n## Medium\n\n### Small");
    expect(html).not.toContain("<h1");
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
    expect(html).toContain("<h4");
  });

  it("renders emphasis, lists and quotes", () => {
    const html = render("**bold** *italic* ~~gone~~\n\n- one\n- two\n\n1. first\n\n> quoted");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<del>gone</del>");
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html).toContain("<blockquote");
  });

  it("keeps code verbatim", () => {
    const html = render("```\n<b>not bold</b> **nor this**\n```");
    expect(html).toContain("&lt;b&gt;not bold&lt;/b&gt; **nor this**");
  });
});
