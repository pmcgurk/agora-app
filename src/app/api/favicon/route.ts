import { NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth";
import { getSiteCreator, isPrivateInstance } from "@/lib/instance";
import { prisma } from "@/lib/prisma";
import { getObjectBuffer } from "@/lib/s3";

const SIZE = 192;
const ROUNDED = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="42" fill="#fff"/></svg>`);

const escapeXml = (value: string) => value.replace(/[<>&"']/g, "");

// A tile with the creator's initial, for creators who have no profile picture yet.
function initialTile(name: string): Promise<Buffer> {
  const initial = escapeXml(Array.from(name.trim())[0]?.toUpperCase() ?? "A");
  return sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
      <rect width="${SIZE}" height="${SIZE}" rx="42" fill="#6d28d9"/>
      <text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="112" font-weight="700" fill="#fff">${initial}</text>
    </svg>`),
  )
    .png()
    .toBuffer();
}

// The browser-tab icon: the creator's profile picture as a small rounded PNG. `?c=<creatorId>` picks a
// creator on a multi-creator site; otherwise it is the site's single creator. Pages add `?v=` with a
// fingerprint of the picture, so a new picture shows up as soon as it is saved.
export async function GET(request: Request) {
  if ((await isPrivateInstance()) && !(await getCurrentUser())) return new NextResponse(null, { status: 401 });
  const id = new URL(request.url).searchParams.get("c");
  const creator = id
    ? await prisma.user.findFirst({ where: { id, role: "CREATOR" }, select: { name: true, avatarKey: true } })
    : await getSiteCreator();

  let png: Buffer | null = null;
  if (creator?.avatarKey) {
    try {
      png = await sharp(await getObjectBuffer(creator.avatarKey))
        .resize(SIZE, SIZE, { fit: "cover" })
        .composite([{ input: ROUNDED, blend: "dest-in" }])
        .png()
        .toBuffer();
    } catch (error) {
      console.error("Building the favicon failed:", error instanceof Error ? error.message : error);
    }
  }
  png ??= await initialTile(creator?.name ?? "Agora");

  return new NextResponse(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}

