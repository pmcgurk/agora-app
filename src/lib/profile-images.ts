export type ProfileImageKind = "avatar" | "banner";

export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

export const PROFILE_IMAGE_SIZE: Record<ProfileImageKind, { width: number; height: number }> = {
  avatar: { width: 512, height: 512 },
  banner: { width: 1600, height: 500 },
};

type ImageOwner = { id: string; avatarKey: string | null; bannerKey: string | null };

export const isProfileImageKind = (value: unknown): value is ProfileImageKind => value === "avatar" || value === "banner";

export const keyField = (kind: ProfileImageKind) => (kind === "avatar" ? "avatarKey" : "bannerKey");

// The version is the random part of the stored key, so replacing an image busts browser caches.
export function profileImageUrl(user: ImageOwner, kind: ProfileImageKind): string | null {
  const key = user[keyField(kind)];
  if (!key) return null;
  const version = key.split("-").pop()?.split(".")[0] ?? "";
  return `/api/avatar/${user.id}?kind=${kind}&v=${version}`;
}

// Only genuine PNG, JPEG or WebP bytes are accepted, whatever the browser claims.
export function sniffImage(bytes: Uint8Array): boolean {
  const startsWith = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const png = startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const jpeg = startsWith(0xff, 0xd8, 0xff);
  const webp = startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return png || jpeg || webp;
}
