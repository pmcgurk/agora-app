import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

// With email set up, signing up does not create an account. It sends the address a link, and the account is
// made when its owner opens the link and chooses a password. So the form gives the same answer for an address
// that has an account and one that has not, and a stranger cannot register someone else's address.

export const SIGNUP_LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Starts (or restarts) a sign-up for this address. A new request replaces the earlier link.
export async function createPendingSignup(email: string, name: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const data = { name, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SIGNUP_LINK_LIFETIME_MS) };
  await prisma.pendingSignup.upsert({ where: { email }, update: { ...data, createdAt: new Date() }, create: { email, ...data } });
  return token;
}

export async function findPendingSignup(token: string): Promise<{ email: string; name: string } | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  const row = await prisma.pendingSignup.findUnique({ where: { tokenHash: hashToken(token) } });
  return row && row.expiresAt > new Date() ? { email: row.email, name: row.name } : null;
}

// Uses the link up. Two requests with the same link cannot both get the sign-up.
export async function takePendingSignup(token: string): Promise<{ email: string; name: string } | null> {
  const found = await findPendingSignup(token);
  if (!found) return null;
  const removed = await prisma.pendingSignup.deleteMany({ where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } } });
  return removed.count === 1 ? found : null;
}
