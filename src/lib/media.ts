// Extension is derived from the allowlisted type, never from a client-supplied file name.
export const ALLOWED_MEDIA = {
  "image/jpeg": { extension: "jpg", kind: "IMAGE" },
  "image/png": { extension: "png", kind: "IMAGE" },
  "image/webp": { extension: "webp", kind: "IMAGE" },
  "image/gif": { extension: "gif", kind: "IMAGE" },
  "video/mp4": { extension: "mp4", kind: "VIDEO" },
  "video/webm": { extension: "webm", kind: "VIDEO" },
  "audio/mpeg": { extension: "mp3", kind: "AUDIO" },
  "audio/ogg": { extension: "ogg", kind: "AUDIO" },
} as const;

export type AllowedContentType = keyof typeof ALLOWED_MEDIA;
export type MediaKindName = "IMAGE" | "VIDEO" | "AUDIO";

export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED_MEDIA).join(",");
export const MAX_FILES_PER_POST = 20;
export const MAX_PREVIEW_SECONDS = 120;
// Images are decoded in memory to build blurred previews, so they get a tighter cap.
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

export function isAllowedContentType(value: unknown): value is AllowedContentType {
  return typeof value === "string" && Object.hasOwn(ALLOWED_MEDIA, value);
}

export function maxUploadBytes(): number {
  const megabytes = Number(process.env.MAX_UPLOAD_MB);
  return (Number.isFinite(megabytes) && megabytes > 0 ? megabytes : 5120) * 1024 * 1024;
}

export function uploadKeyPrefix(creatorId: string): string {
  return `posts/${creatorId}/`;
}
