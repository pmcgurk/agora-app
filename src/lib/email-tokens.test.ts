import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    emailToken: { deleteMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));

import { consumeEmailToken, createEmailToken, findEmailToken, TOKEN_LIFETIME_MS } from "@/lib/email-tokens";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const GOOD = "A".repeat(43);

beforeEach(() => {
  vi.resetAllMocks();
  prisma.$transaction.mockResolvedValue([]);
});

describe("creating links", () => {
  it("returns a long random token and stores only its hash", async () => {
    const token = await createEmailToken("user-1", "PASSWORD_RESET");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const data = prisma.emailToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(data)).not.toContain(token);
  });

  it("makes every token different", async () => {
    expect(await createEmailToken("u", "VERIFY_EMAIL")).not.toBe(await createEmailToken("u", "VERIFY_EMAIL"));
  });

  it("voids the user's earlier unused links of the same kind", async () => {
    await createEmailToken("user-1", "PASSWORD_RESET");
    expect(prisma.emailToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1", kind: "PASSWORD_RESET", usedAt: null } });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("gives reset links an hour and confirmation links three days", async () => {
    const before = Date.now();
    await createEmailToken("u", "PASSWORD_RESET");
    const expires = prisma.emailToken.create.mock.calls[0][0].data.expiresAt.getTime();
    expect(expires - before).toBeGreaterThanOrEqual(TOKEN_LIFETIME_MS.PASSWORD_RESET - 1000);
    expect(expires - before).toBeLessThanOrEqual(TOKEN_LIFETIME_MS.PASSWORD_RESET + 1000);
    expect(TOKEN_LIFETIME_MS.PASSWORD_RESET).toBe(60 * 60 * 1000);
    expect(TOKEN_LIFETIME_MS.VERIFY_EMAIL).toBe(3 * 24 * 60 * 60 * 1000);
  });
});

describe("looking at a link", () => {
  const row = (overrides = {}) => ({ userId: "user-1", kind: "PASSWORD_RESET", usedAt: null, payload: null, expiresAt: new Date(Date.now() + 60_000), ...overrides });

  it("accepts a live link of the right kind", async () => {
    prisma.emailToken.findUnique.mockResolvedValue(row());
    expect(await findEmailToken(GOOD, "PASSWORD_RESET")).toEqual({ userId: "user-1", payload: null });
    expect(prisma.emailToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: sha256(GOOD) } });
  });

  it("refuses unknown, used, expired and wrong-kind links", async () => {
    prisma.emailToken.findUnique.mockResolvedValueOnce(null);
    expect(await findEmailToken(GOOD, "PASSWORD_RESET")).toBeNull();
    prisma.emailToken.findUnique.mockResolvedValueOnce(row({ usedAt: new Date() }));
    expect(await findEmailToken(GOOD, "PASSWORD_RESET")).toBeNull();
    prisma.emailToken.findUnique.mockResolvedValueOnce(row({ expiresAt: new Date(Date.now() - 1) }));
    expect(await findEmailToken(GOOD, "PASSWORD_RESET")).toBeNull();
    prisma.emailToken.findUnique.mockResolvedValueOnce(row({ kind: "VERIFY_EMAIL" }));
    expect(await findEmailToken(GOOD, "PASSWORD_RESET")).toBeNull();
  });

  it("does not even query the database for something that cannot be a token", async () => {
    for (const junk of ["", "short", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}!`, "../etc/passwd"]) {
      expect(await findEmailToken(junk, "PASSWORD_RESET")).toBeNull();
    }
    expect(prisma.emailToken.findUnique).not.toHaveBeenCalled();
  });
});

describe("using a link up", () => {
  beforeEach(() => {
    prisma.emailToken.findUnique.mockResolvedValue({ userId: "user-1", kind: "VERIFY_EMAIL", usedAt: null, expiresAt: new Date(Date.now() + 60_000) });
  });

  it("returns the user when this request is the one that used it", async () => {
    prisma.emailToken.updateMany.mockResolvedValue({ count: 1 });
    expect(await consumeEmailToken(GOOD, "VERIFY_EMAIL")).toBe("user-1");
    expect(prisma.emailToken.updateMany.mock.calls[0][0].where).toMatchObject({ tokenHash: sha256(GOOD), kind: "VERIFY_EMAIL", usedAt: null });
  });

  it("returns nothing when a simultaneous request got there first", async () => {
    prisma.emailToken.updateMany.mockResolvedValue({ count: 0 });
    expect(await consumeEmailToken(GOOD, "VERIFY_EMAIL")).toBeNull();
  });

  it("never touches the row of a link that is not valid", async () => {
    prisma.emailToken.findUnique.mockResolvedValue(null);
    expect(await consumeEmailToken(GOOD, "VERIFY_EMAIL")).toBeNull();
    expect(prisma.emailToken.updateMany).not.toHaveBeenCalled();
  });
});
