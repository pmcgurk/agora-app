import { randomUUID } from "node:crypto";
import { createBlurredImage, createVideoPreview, createVideoThumbnail } from "@/lib/derivatives";
import { prisma } from "@/lib/prisma";
import type { MediaKindName } from "@/lib/media";
import { deleteObject } from "@/lib/s3";

export type Derivatives = {
  blurObjectKey: string | null;
  previewObjectKey: string | null;
  thumbObjectKey: string | null;
  thumbBlurObjectKey: string | null;
};

export const NO_DERIVATIVES: Derivatives = {
  blurObjectKey: null,
  previewObjectKey: null,
  thumbObjectKey: null,
  thumbBlurObjectKey: null,
};

export type TeaserSettings = {
  allowBlurPreview: boolean;
  previewSeconds: number | null;
  // True when the preview length changed, so existing preview clips must be re-cut.
  previewChanged: boolean;
};

// Brings one media item's derived files in line with the post's teaser settings. Callers delete
// `created` if the database write fails and `obsolete` once it succeeds.
export async function syncDerivatives(
  creatorId: string,
  item: { kind: MediaKindName; objectKey: string } & Derivatives,
  settings: TeaserSettings,
): Promise<{ next: Derivatives; created: string[]; obsolete: string[] }> {
  const created: string[] = [];
  const obsolete: string[] = [];
  const next: Derivatives = {
    blurObjectKey: item.blurObjectKey,
    previewObjectKey: item.previewObjectKey,
    thumbObjectKey: item.thumbObjectKey,
    thumbBlurObjectKey: item.thumbBlurObjectKey,
  };

  async function make(extension: string, build: (key: string) => Promise<void>): Promise<string> {
    const key = `derived/${creatorId}/${randomUUID()}.${extension}`;
    created.push(key);
    await build(key);
    return key;
  }

  if (item.kind === "IMAGE") {
    if (settings.allowBlurPreview && !next.blurObjectKey) {
      next.blurObjectKey = await make("webp", (key) => createBlurredImage(item.objectKey, key));
    } else if (!settings.allowBlurPreview && next.blurObjectKey) {
      obsolete.push(next.blurObjectKey);
      next.blurObjectKey = null;
    }
  }

  if (item.kind === "VIDEO") {
    const seconds = settings.previewSeconds;
    if (seconds && (!next.previewObjectKey || settings.previewChanged)) {
      if (next.previewObjectKey) obsolete.push(next.previewObjectKey);
      next.previewObjectKey = await make("mp4", (key) => createVideoPreview(item.objectKey, key, seconds));
    } else if (!seconds && next.previewObjectKey) {
      obsolete.push(next.previewObjectKey);
      next.previewObjectKey = null;
    }

    // Thumbnails are best effort: a post without one still works, it just has no poster image.
    if (!next.thumbObjectKey) {
      try {
        next.thumbObjectKey = await make("jpg", (key) => createVideoThumbnail(item.objectKey, key));
        const thumbKey = next.thumbObjectKey;
        next.thumbBlurObjectKey = await make("webp", (key) => createBlurredImage(thumbKey, key));
      } catch (error) {
        console.error("Video thumbnail generation failed", error);
      }
    }
  }

  return { next, created, obsolete };
}

// Videos posted before thumbnails existed (or whose first attempt failed) get one on first request.
export async function ensureVideoThumbnails(
  creatorId: string,
  media: { id: string; objectKey: string; thumbObjectKey: string | null; thumbBlurObjectKey: string | null },
): Promise<{ thumbObjectKey: string | null; thumbBlurObjectKey: string | null }> {
  if (media.thumbObjectKey && media.thumbBlurObjectKey) return media;
  const created: string[] = [];
  try {
    const thumbKey = media.thumbObjectKey ?? `derived/${creatorId}/${randomUUID()}.jpg`;
    if (!media.thumbObjectKey) {
      created.push(thumbKey);
      await createVideoThumbnail(media.objectKey, thumbKey);
    }
    const blurKey = `derived/${creatorId}/${randomUUID()}.webp`;
    created.push(blurKey);
    await createBlurredImage(thumbKey, blurKey);
    await prisma.postMedia.update({
      where: { id: media.id },
      data: { thumbObjectKey: thumbKey, thumbBlurObjectKey: blurKey },
    });
    return { thumbObjectKey: thumbKey, thumbBlurObjectKey: blurKey };
  } catch (error) {
    console.error("Video thumbnail generation failed", error);
    await deleteObjects(created);
    return media;
  }
}

export async function deleteObjects(keys: Array<string | null | undefined>): Promise<void> {
  await Promise.all(
    keys.filter((key): key is string => !!key).map((key) => deleteObject(key).catch(() => undefined)),
  );
}

export function allKeysOf(item: { objectKey: string } & Derivatives): string[] {
  return [
    item.objectKey,
    item.blurObjectKey,
    item.previewObjectKey,
    item.thumbObjectKey,
    item.thumbBlurObjectKey,
  ].filter((key): key is string => !!key);
}
