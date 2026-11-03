import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isPrivateInstance } from "@/lib/instance";
import { isProfileImageKind, keyField } from "@/lib/profile-images";
import { prisma } from "@/lib/prisma";
import { generatePresignedUrl } from "@/lib/s3";

// Profile pictures and banners are not secret, but they are never public storage links:
// each view is a short-lived presigned redirect, and private instances still require a login.
export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  if ((await isPrivateInstance()) && !(await getCurrentUser())) return new NextResponse(null, { status: 401 });
  const kind = new URL(request.url).searchParams.get("kind") ?? "avatar";
  if (!isProfileImageKind(kind)) return new NextResponse(null, { status: 400 });

  const { userId } = await params;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarKey: true, bannerKey: true } });
  const key = user?.[keyField(kind)];
  if (!key) return new NextResponse(null, { status: 404 });

  const url = await generatePresignedUrl(key, 60);
  return new NextResponse(null, { status: 302, headers: { Location: url, "Cache-Control": "private, max-age=30" } });
}
