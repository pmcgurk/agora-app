import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, getSiteCreator } = vi.hoisted(() => ({ findFirst: vi.fn(), getSiteCreator: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { post: { findFirst } } }));
vi.mock("@/lib/instance", () => ({ getSiteCreator }));

import type { Creator } from "@/lib/creator";
import { postMetadata } from "@/lib/post-metadata";

const creator = { id: "c1", slug: "paul", name: "Paul", avatarKey: "avatars/c1.webp" } as unknown as Creator;
const past = new Date(Date.now() - 86_400_000);
const future = new Date(Date.now() + 86_400_000);

const post = (overrides = {}) => ({
  id: "p1",
  slug: "hello-world",
  title: "Hello World",
  textContent: "This is my first post about **everything**.",
  isPublic: true,
  publishedAt: past,
  editedAt: null,
  media: [],
  ...overrides,
});

beforeEach(() => {
  findFirst.mockReset();
  getSiteCreator.mockResolvedValue({ id: "c1" });
});

describe("post metadata", () => {
  it("describes a public post by its first words, with its readable address as canonical", async () => {
    findFirst.mockResolvedValue(post());
    const meta = await postMetadata(creator, "hello-world");
    expect(meta.title).toBe("Hello World");
    expect(meta.description).toBe("This is my first post about everything.");
    expect(meta.alternates?.canonical).toBe("/posts/hello-world");
    expect(meta.openGraph).toMatchObject({ type: "article", url: "/posts/hello-world", siteName: "Paul", authors: ["Paul"] });
    expect(meta.robots).toBeUndefined();
  });

  it("uses the post's own picture for the preview, falling back to a picture in the text, then the avatar", async () => {
    findFirst.mockResolvedValue(post({ media: [{ id: "gallery1" }] }));
    expect((await postMetadata(creator, "x")).openGraph?.images).toEqual(["/api/media/gallery1"]);
    findFirst.mockResolvedValue(post({ textContent: "Look ![](/api/media/inline9) here" }));
    expect((await postMetadata(creator, "x")).openGraph?.images).toEqual(["/api/media/inline9"]);
    findFirst.mockResolvedValue(post());
    expect((await postMetadata(creator, "x")).openGraph?.images).toEqual(["/api/avatar/c1"]);
  });

  it("gives a members-only post's title and nothing of its text, and keeps it out of search", async () => {
    findFirst.mockResolvedValue(post({ isPublic: false, textContent: "The secret recipe is two cups of flour." }));
    const meta = await postMetadata(creator, "hello-world");
    expect(meta.title).toBe("Hello World");
    expect(meta.description).toBe("A members-only post by Paul.");
    expect(JSON.stringify(meta)).not.toContain("secret");
    expect(JSON.stringify(meta)).not.toContain("flour");
    expect(meta.openGraph).toBeUndefined();
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("reveals nothing about a draft or a scheduled post", async () => {
    for (const publishedAt of [null, future]) {
      findFirst.mockResolvedValue(post({ publishedAt, title: "Secret plans", textContent: "Top secret" }));
      const meta = await postMetadata(creator, "hello-world");
      expect(JSON.stringify(meta)).not.toContain("Secret");
      expect(JSON.stringify(meta)).not.toContain("secret");
      expect(meta.title).toBeUndefined();
      expect(meta.robots).toEqual({ index: false, follow: false });
    }
  });

  it("says nothing for a post that does not exist", async () => {
    findFirst.mockResolvedValue(null);
    expect((await postMetadata(creator, "nope")).title).toBeUndefined();
  });

  it("looks the post up by slug or id, within this creator only", async () => {
    findFirst.mockResolvedValue(post());
    await postMetadata(creator, "hello-world");
    expect(findFirst.mock.calls[0][0].where).toEqual({ creatorId: "c1", OR: [{ slug: "hello-world" }, { id: "hello-world" }] });
  });

  it("keeps the creator's path in the address on a site with several creators", async () => {
    getSiteCreator.mockResolvedValue(null);
    findFirst.mockResolvedValue(post());
    expect((await postMetadata(creator, "hello-world")).alternates?.canonical).toBe("/creators/paul/posts/hello-world");
  });
});
