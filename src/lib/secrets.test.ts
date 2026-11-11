import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, updateMany } = vi.hoisted(() => ({ findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { instanceSetting: { findUnique, updateMany } } }));

import { credentialProblems, decryptSecret, encryptionStatus, encryptSecret, encryptStoredSecrets, isEncrypted } from "@/lib/secrets";

const KEY = "a-long-random-application-secret-1";
const original = process.env.APP_SECRET;

beforeEach(() => {
  process.env.APP_SECRET = KEY;
  findUnique.mockReset();
  updateMany.mockReset().mockResolvedValue({ count: 1 });
});
afterEach(() => {
  if (original === undefined) delete process.env.APP_SECRET;
  else process.env.APP_SECRET = original;
});

describe("encrypting credentials", () => {
  it("round-trips a value and never stores it in the clear", () => {
    const stored = encryptSecret("sk_live_abc123", "stripeSecretKey");
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("sk_live_abc123");
    expect(decryptSecret(stored, "stripeSecretKey")).toBe("sk_live_abc123");
  });

  it("gives a different result every time (fresh nonce)", () => {
    expect(encryptSecret("same", "smtpPassword")).not.toBe(encryptSecret("same", "smtpPassword"));
  });

  it("will not hand a value to a different field", () => {
    const stored = encryptSecret("sk_live_abc123", "stripeSecretKey");
    expect(decryptSecret(stored, "smtpPassword")).toBeNull();
  });

  it("detects tampering", () => {
    const stored = encryptSecret("sk_live_abc123", "stripeSecretKey");
    const parts = stored.split(".");
    parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith("AA") ? "BB" : "AA");
    expect(decryptSecret(parts.join("."), "stripeSecretKey")).toBeNull();
    expect(decryptSecret(stored.slice(0, -4), "stripeSecretKey")).toBeNull();
  });

  it("cannot be read with a different secret, or with none", () => {
    const stored = encryptSecret("sk_live_abc123", "stripeSecretKey");
    process.env.APP_SECRET = "a-completely-different-secret-value";
    expect(decryptSecret(stored, "stripeSecretKey")).toBeNull();
    delete process.env.APP_SECRET;
    expect(decryptSecret(stored, "stripeSecretKey")).toBeNull();
  });

  it("copes with odd input", () => {
    expect(decryptSecret(null, "x")).toBeNull();
    expect(decryptSecret(undefined, "x")).toBeNull();
    expect(decryptSecret("enc:v1:garbage", "x")).toBeNull();
    expect(decryptSecret("enc:v1:", "x")).toBeNull();
  });
});

describe("without encryption", () => {
  it("stores and reads plain values when no secret is set", () => {
    delete process.env.APP_SECRET;
    expect(encryptionStatus()).toBe("off");
    expect(encryptSecret("plain", "smtpPassword")).toBe("plain");
    expect(decryptSecret("plain", "smtpPassword")).toBe("plain");
  });

  it("still reads values saved before encryption was switched on", () => {
    expect(decryptSecret("sk_live_old", "stripeSecretKey")).toBe("sk_live_old");
  });

  it("treats a too-short secret as not set, and says so", () => {
    process.env.APP_SECRET = "short";
    expect(encryptionStatus()).toBe("weak");
    expect(encryptSecret("plain", "smtpPassword")).toBe("plain");
  });
});

describe("encrypting what is already saved", () => {
  it("encrypts plain values and leaves encrypted and empty ones alone", async () => {
    findUnique.mockResolvedValue({ stripeSecretKey: "sk_live_old", stripeWebhookSecret: encryptSecret("whsec_x", "stripeWebhookSecret"), smtpPassword: null });
    expect(await encryptStoredSecrets()).toBe(1);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const call = updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "instance", stripeSecretKey: "sk_live_old" });
    expect(decryptSecret(call.data.stripeSecretKey, "stripeSecretKey")).toBe("sk_live_old");
  });

  it("does nothing without a key", async () => {
    delete process.env.APP_SECRET;
    expect(await encryptStoredSecrets()).toBe(0);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("what the owner is told", () => {
  it("reports plain text that is still stored", async () => {
    findUnique.mockResolvedValue({ stripeSecretKey: "sk_live_old", stripeWebhookSecret: null, smtpPassword: null });
    expect(await credentialProblems()).toEqual({ status: "on", plainTextStored: true, unreadable: false });
  });

  it("reports credentials that can no longer be read", async () => {
    const stored = encryptSecret("sk_live_x", "stripeSecretKey");
    process.env.APP_SECRET = "another-secret-than-the-first-one";
    findUnique.mockResolvedValue({ stripeSecretKey: stored, stripeWebhookSecret: null, smtpPassword: null });
    expect(await credentialProblems()).toMatchObject({ unreadable: true, plainTextStored: false });
  });

  it("is quiet when everything is encrypted and readable", async () => {
    findUnique.mockResolvedValue({ stripeSecretKey: encryptSecret("sk_live_x", "stripeSecretKey"), stripeWebhookSecret: null, smtpPassword: null });
    expect(await credentialProblems()).toEqual({ status: "on", plainTextStored: false, unreadable: false });
  });
});
