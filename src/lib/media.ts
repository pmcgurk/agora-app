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
export type MediaKindName = "IMAGE" | "VIDEO" | "AUDIO" | "FILE";

// Anything outside the allowlist is stored as a generic downloadable file (e.g. 3D prints, ZIPs, PDFs).
export const GENERIC_FILE = { extension: "bin", kind: "FILE", contentType: "application/octet-stream" } as const;

export function describeUpload(contentType: string | undefined): { extension: string; kind: MediaKindName; contentType: string } {
  if (isAllowedContentType(contentType)) return { ...ALLOWED_MEDIA[contentType], contentType };
  return { ...GENERIC_FILE };
}

export const MAX_FILE_NAME_LENGTH = 200;

// Strips path pieces and control characters; the name is only ever used as a download label.
export function cleanFileName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Control characters are stripped on purpose.
  // oxlint-disable-next-line no-control-regex
  const name = value.replace(/[\\/]+/g, "_").replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return name ? name.slice(0, MAX_FILE_NAME_LENGTH) : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export const ACCEPT_ATTRIBUTE = "*/*";
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
