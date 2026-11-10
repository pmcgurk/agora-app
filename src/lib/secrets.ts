import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Credentials saved in Settings (the Stripe keys and the SMTP password) are encrypted before they reach the
// database, with a key made from APP_SECRET in the server's environment. A copy of the database or a backup
// then does not contain them in a usable form. Values from before encryption was switched on are still read
// as they are and get encrypted the next time the server starts.
//
// AES-256-GCM: each value has its own random nonce, an authentication tag so tampering is detected, and the
// name of its field is bound in, so one stored value cannot be copied into another field.

const PREFIX = "enc:v1:";
const MIN_SECRET_LENGTH = 16;

function encryptionKey(): Buffer | null {
  const secret = process.env.APP_SECRET?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  return Buffer.from(hkdfSync("sha256", secret, "agora-saved-credentials", "aes-256-gcm", 32));
}

export type EncryptionStatus = "on" | "off" | "weak";

export function encryptionStatus(): EncryptionStatus {
  const secret = process.env.APP_SECRET?.trim();
  if (!secret) return "off";
  return secret.length >= MIN_SECRET_LENGTH ? "on" : "weak";
}

export const isEncrypted = (value: string | null | undefined): boolean => typeof value === "string" && value.startsWith(PREFIX);

// Encrypts when a key is configured, and otherwise returns the value unchanged (the settings pages warn about that).
export function encryptSecret(plain: string, field: string): string {
  const key = encryptionKey();
  if (!key) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(field));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${[iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(".")}`;
}

// The readable value, or null when it is encrypted and cannot be read (no key, a different key, or damage).
// A value that was never encrypted comes back as it is.
export function decryptSecret(stored: string | null | undefined, field: string): string | null {
  if (stored === null || stored === undefined) return null;
  if (!isEncrypted(stored)) return stored;
  const key = encryptionKey();
  if (!key) return null;
  try {
    const [iv, tag, body] = stored.slice(PREFIX.length).split(".").map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(field));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const FIELDS = ["stripeSecretKey", "stripeWebhookSecret", "smtpPassword"] as const;

// Encrypts any credentials still stored as plain text. Runs when the server starts, so setting APP_SECRET and
// restarting is all it takes to protect what is already saved.
export async function encryptStoredSecrets(): Promise<number> {
  if (encryptionStatus() !== "on") return 0;
  const row = await prisma.instanceSetting.findUnique({ where: { id: "instance" }, select: { stripeSecretKey: true, stripeWebhookSecret: true, smtpPassword: true } });
  if (!row) return 0;
  let changed = 0;
  for (const field of FIELDS) {
    const value = row[field];
    if (!value || isEncrypted(value)) continue;
    // Only if it is still the value we read, so a save that happened meanwhile is not overwritten.
    const result = await prisma.instanceSetting.updateMany({ where: { id: "instance", [field]: value }, data: { [field]: encryptSecret(value, field) } });
    changed += result.count;
  }
  return changed;
}

export type CredentialProblems = { status: EncryptionStatus; plainTextStored: boolean; unreadable: boolean };

// What the owner should be told on the Payments and Email pages.
export async function credentialProblems(): Promise<CredentialProblems> {
  const row = await prisma.instanceSetting.findUnique({ where: { id: "instance" }, select: { stripeSecretKey: true, stripeWebhookSecret: true, smtpPassword: true } });
  const values = FIELDS.map((field) => ({ field, value: row?.[field] ?? null })).filter((entry) => entry.value);
  return {
    status: encryptionStatus(),
    plainTextStored: values.some((entry) => !isEncrypted(entry.value)),
    unreadable: values.some((entry) => isEncrypted(entry.value) && decryptSecret(entry.value, entry.field) === null),
  };
}
