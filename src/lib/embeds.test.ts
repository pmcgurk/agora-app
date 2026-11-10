import { describe, expect, it } from "vitest";
import { EMBED_ORIGINS, parseEmbed } from "@/lib/embeds";

describe("parseEmbed: accepted links", () => {
  it("turns the usual YouTube forms into a privacy-friendly player", () => {
    const expected = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    expect(parseEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.src).toBe(expected);
    expect(parseEmbed("https://youtu.be/dQw4w9WgXcQ")?.src).toBe(expected);
    expect(parseEmbed("https://m.youtube.com/shorts/dQw4w9WgXcQ")?.src).toBe(expected);
    expect(parseEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ")?.src).toBe(expected);
  });

  it("keeps a start time, but only as a number", () => {
    expect(parseEmbed("https://youtu.be/dQw4w9WgXcQ?t=42")?.src).toMatch(/\?start=42$/);
    expect(parseEmbed("https://youtu.be/dQw4w9WgXcQ?t=abc")?.src).not.toContain("start");
  });

  it("handles Vimeo, Loom and Spotify", () => {
    expect(parseEmbed("https://vimeo.com/123456789")?.src).toBe("https://player.vimeo.com/video/123456789?dnt=1");
    expect(parseEmbed("https://www.loom.com/share/0123456789abcdef0123456789abcdef")?.src).toBe(
      "https://www.loom.com/embed/0123456789abcdef0123456789abcdef",
    );
    const spotify = parseEmbed("https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk");
    expect(spotify).toEqual({ src: "https://open.spotify.com/embed/episode/4rOoJ6Egrf8K2IrywzwOMk", title: "Spotify player", ratio: "audio" });
  });

  it("only ever builds addresses on origins the CSP allows", () => {
    const links = [
      "https://youtu.be/dQw4w9WgXcQ",
      "https://vimeo.com/123456789",
      "https://www.loom.com/share/0123456789abcdef0123456789abcdef",
      "https://open.spotify.com/track/4rOoJ6Egrf8K2IrywzwOMk",
    ];
    for (const link of links) {
      const embed = parseEmbed(link)!;
      expect(EMBED_ORIGINS).toContain(new URL(embed.src).origin);
    }
  });
});

describe("parseEmbed: refused links", () => {
  it("refuses other sites, look-alike hosts and odd schemes", () => {
    expect(parseEmbed("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseEmbed("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseEmbed("https://evilyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseEmbed("javascript:alert(1)")).toBeNull();
    expect(parseEmbed("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(parseEmbed("ftp://youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(parseEmbed("not a url")).toBeNull();
  });

  it("refuses ids that could smuggle characters into the iframe address", () => {
    expect(parseEmbed("https://www.youtube.com/watch?v=a%22onload%3Dalert(1)")).toBeNull();
    expect(parseEmbed("https://www.youtube.com/watch?v=../../etc")).toBeNull();
    expect(parseEmbed("https://vimeo.com/abc")).toBeNull();
    expect(parseEmbed("https://www.loom.com/share/not-hex")).toBeNull();
  });
});
