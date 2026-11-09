import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth";
import { DEMO_OFF, isDemoMode } from "@/lib/demo";
import {
  isProfileImageKind,
  keyField,
  MAX_PROFILE_IMAGE_BYTES,
  PROFILE_IMAGE_SIZE,
  sniffImage,
} from "@/lib/profile-images";
import { prisma } from "@/lib/prisma";
import { deleteObject, uploadObject } from "@/lib/s3";

const back = (request: Request, kind: "notice" | "error", message: string) =>
  NextResponse.redirect(new URL(`/settings/profile?${kind}=${encodeURIComponent(message)}`, publicOrigin(request)), 303);

function publicOrigin(request: Request): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? new URL(request.url).origin;
}

// Form posts are cross-site-forgeable, so the Origin header must match this site.
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const host = new URL(origin).host;
    const allowed = [request.headers.get("host"), request.headers.get("x-forwarded-host"), new URL(publicOrigin(request)).host];
    return allowed.includes(host);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (isDemoMode()) return back(request, "error", DEMO_OFF);

  const form = await request.formData().catch(() => null);
  const kind = form?.get("kind");
  if (!form || !isProfileImageKind(kind)) return back(request, "error", "Unknown image type.");
  if (kind === "banner" && user.role !== "CREATOR") return back(request, "error", "Only creators have a banner.");

  const field = keyField(kind);
  const oldKey = user[field];
  let newKey: string | null = null;

  if (form.get("remove") === "1") {
    await prisma.user.update({ where: { id: user.id }, data: { [field]: null } });
  } else {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return back(request, "error", "Choose an image first.");
    if (file.size > MAX_PROFILE_IMAGE_BYTES) return back(request, "error", "That image is over 5 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!sniffImage(bytes)) return back(request, "error", "Use a PNG, JPEG or WebP image.");

    // Re-encoding drops metadata such as GPS and rejects files that only look like images.
    let output: Buffer;
    try {
      const { width, height } = PROFILE_IMAGE_SIZE[kind];
      output = await sharp(bytes, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(width, height, { fit: "cover" })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      return back(request, "error", "That image could not be read.");
    }
    newKey = `profiles/${user.id}/${kind}-${randomUUID()}.webp`;
    await uploadObject(newKey, output, "image/webp");
    await prisma.user.update({ where: { id: user.id }, data: { [field]: newKey } });
  }

  if (oldKey && oldKey !== newKey) await deleteObject(oldKey).catch(() => undefined);
  return back(request, "notice", kind === "avatar" ? "Profile picture updated." : "Banner updated.");
}
