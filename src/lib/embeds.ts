// Video and audio embeds for post text. A link alone on its own line becomes a player, but only
// for the providers listed here, and only through an address we build ourselves from the parsed
// id, so post text can never put an arbitrary address in an iframe.

export type Embed = { src: string; title: string; ratio: "video" | "audio" };

const ID = /^[A-Za-z0-9_-]{6,40}$/;

export function parseEmbed(raw: string): Embed | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^(www|m)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    const id =
      host === "youtu.be"
        ? parts[0]
        : parts[0] === "watch"
          ? url.searchParams.get("v")
          : ["embed", "shorts", "live", "v"].includes(parts[0])
            ? parts[1]
            : null;
    if (!id || !ID.test(id)) return null;
    const start = Number.parseInt(url.searchParams.get("t") ?? url.searchParams.get("start") ?? "", 10);
    const query = Number.isFinite(start) && start > 0 ? `?start=${start}` : "";
    return { src: `https://www.youtube-nocookie.com/embed/${id}${query}`, title: "YouTube video", ratio: "video" };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parts.find((part) => /^\d{5,12}$/.test(part));
    return id ? { src: `https://player.vimeo.com/video/${id}?dnt=1`, title: "Vimeo video", ratio: "video" } : null;
  }
  if (host === "loom.com") {
    const id = parts[0] === "share" || parts[0] === "embed" ? parts[1] : null;
    return id && /^[a-f0-9]{32}$/.test(id) ? { src: `https://www.loom.com/embed/${id}`, title: "Loom video", ratio: "video" } : null;
  }
  if (host === "open.spotify.com") {
    const [kind, id] = parts[0]?.startsWith("intl-") ? parts.slice(1) : parts;
    if (["track", "album", "playlist", "episode", "show"].includes(kind) && id && /^[A-Za-z0-9]{10,30}$/.test(id)) {
      return { src: `https://open.spotify.com/embed/${kind}/${id}`, title: "Spotify player", ratio: "audio" };
    }
  }
  return null;
}

// Origins the content security policy lets pages frame.
export const EMBED_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://www.loom.com",
  "https://open.spotify.com",
];
