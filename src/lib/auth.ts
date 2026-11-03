import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

const COOKIE_NAME = "agora_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Only a hash of the session token is stored, so a database leak does not expose live sessions.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NEXT_PUBLIC_BASE_URL?.startsWith("https://") ?? false,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(COOKIE_NAME);
}

// After a password change, every session except the current one is signed out.
export async function destroyOtherSessions(userId: string): Promise<void> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  await prisma.session.deleteMany({
    where: { userId, ...(token ? { NOT: { tokenHash: hashToken(token) } } : {}) },
  });
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

export async function requireUser(role?: Role) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) redirect("/dashboard");
  return user;
}
