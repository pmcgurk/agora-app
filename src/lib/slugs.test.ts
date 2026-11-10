import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { post: { findMany } } }));

import { markdownExcerpt } from "@/lib/excerpt";
import { slugify, uniquePostSlug } from "@/lib/slugs";

describe("slugify", () => {
  it("makes a readable address from a title", () => {
    expect(slugify("Hello World - Hello Agora")).toBe("hello-world-hello-agora");
    expect(slugify("  Why I left   Twitter!!  ")).toBe("why-i-left-twitter");
  });

  it("drops accents instead of dropping the letters", () => {
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
  });

  it("falls back to 'post' when nothing usable is left", () => {
    expect(slugify("")).toBe("post");
    expect(slugify("!!!")).toBe("post");
    expect(slugify("日本語のタイトル")).toBe("post");
  });

  it("never ends or starts with a hyphen, even after cutting to length", () => {
    expect(slugify("a".repeat(58) + " b c", 60).endsWith("-")).toBe(false);
    expect(slugify("-x-")).toBe("x");
    expect(slugify("one two three four five", 8)).toBe("one-two");
  });

  it("only produces characters that are safe in a URL", () => {
    expect(slugify("../../etc/passwd?<script>")).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("uniquePostSlug", () => {
  beforeEach(() => findMany.mockReset());

  it("uses the plain slug when it is free", async () => {
    findMany.mockResolvedValue([]);
    expect(await uniquePostSlug("c1", "My First Post")).toBe("my-first-post");
  });

  it("numbers repeats", async () => {
    findMany.mockResolvedValue([{ slug: "my-first-post" }, { slug: "my-first-post-2" }, { slug: "my-first-post-extra" }]);
    expect(await uniquePostSlug("c1", "My First Post")).toBe("my-first-post-3");
  });

  it("does not count the post being edited against itself", async () => {
    findMany.mockResolvedValue([]);
    await uniquePostSlug("c1", "My First Post", "post-9");
    expect(findMany.mock.calls[0][0].where).toMatchObject({ creatorId: "c1", id: { not: "post-9" } });
  });
});

describe("markdownExcerpt", () => {
  it("keeps the words and drops the markup", () => {
    expect(markdownExcerpt("# Title\n\nSome **bold** and *italic* text with a [link](https://example.com).")).toBe(
      "Title Some bold and italic text with a link.",
    );
  });

  it("drops pictures, embeds and bare links", () => {
    const text = "Intro line.\n\n![alt](/api/media/abc)\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n\nOutro, see https://example.com now.";
    expect(markdownExcerpt(text)).toBe("Intro line. Outro, see now.");
  });

  it("drops code blocks and list markers", () => {
    expect(markdownExcerpt("Before\n\n```\nsecret code\n```\n\n- one\n- two\n\n> quoted")).toBe("Before one two quoted");
  });

  it("cuts long text on a word and adds an ellipsis", () => {
    const result = markdownExcerpt("word ".repeat(100), 50);
    expect(result.length).toBeLessThanOrEqual(51);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toMatch(/wor…$/);
  });

  it("returns short text unchanged and empty text as empty", () => {
    expect(markdownExcerpt("Hi there")).toBe("Hi there");
    expect(markdownExcerpt("")).toBe("");
  });
});
