import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notifications", () => ({ notifyTip: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2", "x-real-ip": "9.9.9.9" }) }));

import { hashApiKey } from "@/lib/api-keys";
import { hashPassword, verifyPassword } from "@/lib/password";
import { clientIp, withinLimit } from "@/lib/rate-limit";
import { parseTipAmount } from "@/lib/tips";
import { parseWebhookUrl, signPayload } from "@/lib/webhooks";

describe("passwords", () => {
  it("accepts the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterz", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts every hash, so equal passwords give different hashes", async () => {
    expect(await hashPassword("same-password-1")).not.toBe(await hashPassword("same-password-1"));
  });

  it("never stores the password itself", async () => {
    expect(await hashPassword("hunter2hunter2")).not.toContain("hunter2");
  });

  it("rejects malformed stored values instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "plain-text")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$a$b")).toBe(false);
    expect(await verifyPassword("x", "scrypt$$")).toBe(false);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit, then refuses", () => {
    const key = `test-${Math.random()}`;
    expect([1, 2, 3].map(() => withinLimit(key, 3, 60_000))).toEqual([true, true, true]);
    expect(withinLimit(key, 3, 60_000)).toBe(false);
  });

  it("keeps separate counts per key", () => {
    const a = `a-${Math.random()}`;
    expect(withinLimit(a, 1, 60_000)).toBe(true);
    expect(withinLimit(a, 1, 60_000)).toBe(false);
    expect(withinLimit(`b-${Math.random()}`, 1, 60_000)).toBe(true);
  });

  it("starts again after the window", () => {
    vi.useFakeTimers();
    const key = `window-${Math.random()}`;
    expect(withinLimit(key, 1, 1000)).toBe(true);
    expect(withinLimit(key, 1, 1000)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(withinLimit(key, 1, 1000)).toBe(true);
    vi.useRealTimers();
  });

  it("trusts the address the proxy appended (the rightmost one), not what the client claimed", async () => {
    expect(await clientIp()).toBe("2.2.2.2");
  });
});

describe("tips", () => {
  it("parses amounts into minor units", () => {
    expect(parseTipAmount("5")).toBe(500);
    expect(parseTipAmount("5.5")).toBe(550);
    expect(parseTipAmount("5,50")).toBe(550);
    expect(parseTipAmount(" 10.00 ")).toBe(1000);
  });

  it("refuses amounts that are too small, too large or not numbers", () => {
    expect(parseTipAmount("0.50")).toBeNull();
    expect(parseTipAmount("1001")).toBeNull();
    expect(parseTipAmount("1000")).toBe(100_000);
    expect(parseTipAmount("abc")).toBeNull();
    expect(parseTipAmount("5.555")).toBeNull();
    expect(parseTipAmount("-5")).toBeNull();
    expect(parseTipAmount("")).toBeNull();
  });
});

describe("webhooks and API keys", () => {
  it("only allows http and https webhook targets", () => {
    expect(parseWebhookUrl("https://example.com/hook")).toBe("https://example.com/hook");
    expect(parseWebhookUrl("http://localhost:8080/x")).toBe("http://localhost:8080/x");
    expect(parseWebhookUrl("file:///etc/passwd")).toBeNull();
    expect(parseWebhookUrl("javascript:alert(1)")).toBeNull();
    expect(parseWebhookUrl("nonsense")).toBeNull();
  });

  it("signs the timestamp and body, so a replayed body with a new time fails", () => {
    const signature = signPayload("whsec_test", "1700000000", '{"a":1}');
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signPayload("whsec_test", "1700000000", '{"a":1}')).toBe(signature);
    expect(signPayload("whsec_test", "1700000001", '{"a":1}')).not.toBe(signature);
    expect(signPayload("whsec_other", "1700000000", '{"a":1}')).not.toBe(signature);
  });

  it("stores API keys only as hashes", () => {
    expect(hashApiKey("agora_secret")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey("agora_secret")).not.toContain("secret");
  });
});
