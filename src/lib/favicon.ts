import { createHash } from "node:crypto";
import type { Metadata } from "next";

// The browser-tab icon for a creator's pages: their profile picture (or, without one, a tile with their
// initial), served by /api/favicon. The address carries a fingerprint of the picture, so browsers fetch
// the new icon as soon as it changes instead of keeping the old one.
export function creatorIcons(
  creator: { id: string; name: string; avatarKey: string | null },
  options: { single: boolean },
): Metadata["icons"] {
  const version = createHash("sha256").update(`${creator.avatarKey ?? `initial:${creator.name}`}`).digest("hex").slice(0, 10);
  const url = `/api/favicon?${options.single ? "" : `c=${creator.id}&`}v=${version}`;
  return { icon: [{ url, type: "image/png", sizes: "192x192" }], apple: [{ url, sizes: "192x192" }] };
}
