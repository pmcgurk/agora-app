import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  describeUpload,
  MAX_IMAGE_BYTES,
  maxUploadBytes,
  uploadKeyPrefix,
} from "@/lib/media";
import { generatePresignedUploadUrl } from "@/lib/s3";

// Step 1 of an upload: authorize it and hand the browser a presigned PUT URL for MinIO.
// The file bytes never pass through the app. Step 2 happens when the post is published.
// Photos, video and audio keep their type; every other file is stored as an opaque download.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "CREATOR") return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Expected JSON." }, { status: 415 });
  }

  const body = (await request.json().catch(() => null)) as { contentType?: unknown; size?: unknown } | null;
  const size = body?.size;
  const upload = describeUpload(typeof body?.contentType === "string" ? body.contentType : undefined);
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
  }
  const limit = upload.kind === "IMAGE" ? MAX_IMAGE_BYTES : maxUploadBytes();
  if (size > limit) {
    return NextResponse.json(
      { error: `File is too large (limit ${Math.round(limit / 1024 / 1024)} MB).` },
      { status: 413 },
    );
  }

  const key = `${uploadKeyPrefix(user.id)}${randomUUID()}.${upload.extension}`;
  const url = await generatePresignedUploadUrl(key, upload.contentType);
  return NextResponse.json({ key, url, contentType: upload.contentType });
}
