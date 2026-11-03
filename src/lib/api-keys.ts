import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const KEY_PREFIX = "agora_";
const TOUCH_INTERVAL_MS = 60_000;

export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

// The full key is only ever returned here; the database keeps a hash and a short display prefix.
export async function createApiKey(userId: string, name: string): Promise<string> {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  await prisma.apiKey.create({
    data: { userId, name, prefix: key.slice(0, KEY_PREFIX.length + 6), keyHash: hashApiKey(key) },
  });
  return key;
}

export async function authenticateApiKey(header: string | null) {
  const match = /^Bearer\s+(agora_[A-Za-z0-9_-]+)$/.exec(header ?? "");
  if (!match) return null;
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(match[1]) },
    include: { user: true },
  });
  if (!key || key.user.role !== "CREATOR") return null;
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return { keyId: key.id, user: key.user };
}
