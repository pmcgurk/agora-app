export type SocialPlatform = {
  key: string;
  label: string;
  // Hosts a pasted URL may use; a bare handle is expanded with `profileUrl`.
  hosts: string[];
  profileUrl?: (handle: string) => string;
};

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { key: "website", label: "Website", hosts: [] },
  { key: "x", label: "X / Twitter", hosts: ["x.com", "twitter.com"], profileUrl: (h) => `https://x.com/${h}` },
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"], profileUrl: (h) => `https://instagram.com/${h}` },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"], profileUrl: (h) => `https://youtube.com/@${h}` },
  { key: "tiktok", label: "TikTok", hosts: ["tiktok.com"], profileUrl: (h) => `https://tiktok.com/@${h}` },
  { key: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com"], profileUrl: (h) => `https://facebook.com/${h}` },
  { key: "twitch", label: "Twitch", hosts: ["twitch.tv"], profileUrl: (h) => `https://twitch.tv/${h}` },
  { key: "bluesky", label: "Bluesky", hosts: ["bsky.app"], profileUrl: (h) => `https://bsky.app/profile/${h}` },
  { key: "discord", label: "Discord", hosts: ["discord.gg", "discord.com"] },
  { key: "github", label: "GitHub", hosts: ["github.com"], profileUrl: (h) => `https://github.com/${h}` },
  { key: "linkedin", label: "LinkedIn", hosts: ["linkedin.com"], profileUrl: (h) => `https://linkedin.com/in/${h}` },
  { key: "reddit", label: "Reddit", hosts: ["reddit.com"], profileUrl: (h) => `https://reddit.com/user/${h}` },
];

const HANDLE_PATTERN = /^[\w.-]{1,60}$/;
const MAX_URL_LENGTH = 300;

function hostMatches(host: string, allowed: string[]): boolean {
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

// Returns a safe https URL for the platform, or null when the input is not acceptable.
export function normalizeSocialLink(platform: SocialPlatform, raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > MAX_URL_LENGTH) return null;

  if (!/^https?:\/\//i.test(value)) {
    const handle = value.replace(/^@/, "");
    if (platform.profileUrl && HANDLE_PATTERN.test(handle)) return platform.profileUrl(handle);
    return normalizeSocialLink(platform, `https://${value}`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".")) return null;
  if (platform.hosts.length > 0 && !hostMatches(host, platform.hosts)) return null;
  url.protocol = "https:";
  return url.toString();
}

// Reads whatever is stored in the database and keeps only recognised, safe entries.
export function readSocialLinks(stored: unknown): { platform: SocialPlatform; url: string }[] {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return [];
  const record = stored as Record<string, unknown>;
  const result: { platform: SocialPlatform; url: string }[] = [];
  for (const platform of SOCIAL_PLATFORMS) {
    const value = record[platform.key];
    if (typeof value !== "string") continue;
    const url = normalizeSocialLink(platform, value);
    if (url) result.push({ platform, url });
  }
  return result;
}
