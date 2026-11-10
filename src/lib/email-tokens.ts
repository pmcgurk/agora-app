import { createHash, randomBytes } from "node:crypto";
import type { EmailTokenKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

// Single-use links sent by email. Only a hash is stored, so reading the database never reveals a
// working link, and a link stops working once it is used, replaced or has expired.

export const TOKEN_LIFETIME_MS: Record<EmailTokenKind, number> = {
  PASSWORD_RESET: 60 * 60 * 1000,
  VERIFY_EMAIL: 3 * 24 * 60 * 60 * 1000,
};

// 32 random bytes in base64url is always 43 characters.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Makes a fresh link for the user; any earlier unused link of the same kind stops working.
export async function createEmailToken(userId: string, kind: EmailTokenKind): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.emailToken.deleteMany({ where: { userId, kind, usedAt: null } }),
    prisma.emailToken.create({
      data: { userId, kind, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS[kind]) },
    }),
  ]);
  return token;
}

// Looks at a link without using it, to decide what page to show.
export async function findEmailToken(token: string, kind: EmailTokenKind): Promise<{ userId: string } | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.kind !== kind || row.usedAt !== null || row.expiresAt <= new Date()) return null;
  return { userId: row.userId };
}

// Uses a link up. Two requests with the same link cannot both succeed: only the one that flips
// usedAt from null gets the user back.
export async function consumeEmailToken(token: string, kind: EmailTokenKind): Promise<string | null> {
  const found = await findEmailToken(token, kind);
  if (!found) return null;
  const claimed = await prisma.emailToken.updateMany({
    where: { tokenHash: hashToken(token), kind, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1 ? found.userId : null;
}
