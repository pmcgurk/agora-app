import { NextResponse } from "next/server";
import { canView, getAccessContext } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { isPrivateInstance } from "@/lib/instance";
import { ensureVideoThumbnails } from "@/lib/post-media";
import { prisma } from "@/lib/prisma";
import { generatePresignedUrl, streamObject } from "@/lib/s3";

const PRESIGNED_URL_TTL_SECONDS = 60;
const NO_STORE = { "Cache-Control": "private, no-store" };

// Every request is authorized here (Rule 1).
// - Images, blurs and thumbnails: 302 to a 60-second presigned URL.
// - Video and audio: streamed through this route with Range support. The browser only ever
//   holds this cookie-protected URL, never a storage link that could be copied and shared.
// `?variant=blur|preview|thumb` selects a server-made derivative; the server decides what the
// viewer may receive, so nothing is exposed that the creator did not allow.
export async function GET(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  if ((await isPrivateInstance()) && !(await getCurrentUser())) return new NextResponse(null, { status: 401 });
  const { mediaId } = await params;
  const variant = new URL(request.url).searchParams.get("variant");
  if (variant !== null && !["blur", "preview", "thumb"].includes(variant)) {
    return new NextResponse(null, { status: 400 });
  }

  const media = await prisma.postMedia.findUnique({
    where: { id: mediaId },
    include: { post: { include: { minTier: { select: { price: true } } } } },
  });
  if (!media) return new NextResponse(null, { status: 404 });
  const { post } = media;

  let objectKey: string | null = null;
  if (variant === "blur") {
    objectKey = media.kind === "IMAGE" && post.allowBlurPreview ? media.blurObjectKey : null;
  } else if (variant === "preview") {
    objectKey = media.kind === "VIDEO" && post.previewSeconds ? media.previewObjectKey : null;
  } else {
    const access = await getAccessContext(post.creatorId, await getCurrentUser());
    const allowed = canView(post, access);
    if (variant === "thumb") {
      if (media.kind === "VIDEO") {
        const thumbs = await ensureVideoThumbnails(post.creatorId, media);
        objectKey = allowed || post.clearThumbnail ? thumbs.thumbObjectKey : thumbs.thumbBlurObjectKey;
      }
    } else {
      if (!allowed) return new NextResponse(null, { status: 403 });
      objectKey = media.objectKey;
    }
  }
  if (!objectKey) return new NextResponse(null, { status: 404 });

  const streamed = media.kind !== "IMAGE" && variant !== "thumb" && variant !== "blur";
  if (!streamed) {
    const url = await generatePresignedUrl(objectKey, PRESIGNED_URL_TTL_SECONDS);
    return new NextResponse(null, { status: 302, headers: { Location: url, ...NO_STORE } });
  }

  const result = await streamObject(objectKey, request.headers.get("range"), request.signal);
  if (result === null) return new NextResponse(null, { status: 404 });
  if (result === "unsatisfiable") return new NextResponse(null, { status: 416, headers: NO_STORE });
  const download = media.kind === "FILE";
  return new NextResponse(result.body, {
    status: result.status,
    headers: {
      ...result.headers,
      ...NO_STORE,
      // Generic files are never rendered by the browser: they always download as opaque bytes.
      ...(download ? { "Content-Type": "application/octet-stream" } : {}),
      "Content-Disposition": download ? `attachment; filename*=UTF-8''${encodeURIComponent(media.fileName ?? "download")}` : "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
