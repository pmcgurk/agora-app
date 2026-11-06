import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_COOKIE = "agora_invite_link";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Returns the raw token once; only its hash is stored.
export async function createCreatorInvite(input: {
  createdById: string;
  email: string;
  name: string;
  slug: string | null;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.creatorInvite.create({
    data: {
      ...input,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  return token;
}

// An invite is usable once, before it expires.
export async function findOpenInvite(token: string) {
  if (!token || token.length > 200) return null;
  const invite = await prisma.creatorInvite.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return null;
  return invite;
}
