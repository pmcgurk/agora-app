import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert, findUnique, deleteMany } = vi.hoisted(() => ({ upsert: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { pendingSignup: { upsert, findUnique, deleteMany } } }));

import { createPendingSignup, findPendingSignup, SIGNUP_LINK_LIFETIME_MS, takePendingSignup } from "@/lib/pending-signups";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const GOOD = "B".repeat(43);

beforeEach(() => {
  upsert.mockReset().mockResolvedValue({});
  findUnique.mockReset();
  deleteMany.mockReset();
});

describe("pending sign-ups", () => {
  it("stores only a hash of the link and replaces an earlier request for the same address", async () => {
    const token = await createPendingSignup("pat@example.com", "Pat");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const call = upsert.mock.calls[0][0];
    expect(call.where).toEqual({ email: "pat@example.com" });
    expect(call.create.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(call)).not.toContain(token);
    expect(call.update.tokenHash).toBe(sha256(token));
    expect(call.create.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(SIGNUP_LINK_LIFETIME_MS);
  });

  it("finds a live link, and refuses expired, unknown and malformed ones", async () => {
    findUnique.mockResolvedValueOnce({ email: "pat@example.com", name: "Pat", emailPosts: true, expiresAt: new Date(Date.now() + 60_000) });
    expect(await findPendingSignup(GOOD)).toEqual({ email: "pat@example.com", name: "Pat", emailPosts: true });
    findUnique.mockResolvedValueOnce({ email: "pat@example.com", name: "Pat", expiresAt: new Date(Date.now() - 1) });
    expect(await findPendingSignup(GOOD)).toBeNull();
    findUnique.mockResolvedValueOnce(null);
    expect(await findPendingSignup(GOOD)).toBeNull();
    findUnique.mockClear();
    expect(await findPendingSignup("short")).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("gives the sign-up to only one of two simultaneous uses of a link", async () => {
    findUnique.mockResolvedValue({ email: "pat@example.com", name: "Pat", emailPosts: false, expiresAt: new Date(Date.now() + 60_000) });
    deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await takePendingSignup(GOOD)).toEqual({ email: "pat@example.com", name: "Pat", emailPosts: false });
    expect(await takePendingSignup(GOOD)).toBeNull();
  });
});
