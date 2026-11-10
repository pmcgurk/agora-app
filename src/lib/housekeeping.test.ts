import { beforeEach, describe, expect, it, vi } from "vitest";

const { sessionDelete, tokenDelete, signupDelete } = vi.hoisted(() => ({ sessionDelete: vi.fn(), tokenDelete: vi.fn(), signupDelete: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { session: { deleteMany: sessionDelete }, emailToken: { deleteMany: tokenDelete }, pendingSignup: { deleteMany: signupDelete } } }));

import { cleanExpired } from "@/lib/housekeeping";

const now = new Date("2026-06-10T12:00:00Z");

beforeEach(() => {
  sessionDelete.mockReset().mockResolvedValue({ count: 3 });
  tokenDelete.mockReset().mockResolvedValue({ count: 2 });
  signupDelete.mockReset().mockResolvedValue({ count: 1 });
});

describe("cleanExpired", () => {
  it("removes only sessions that have already expired", async () => {
    await cleanExpired(now);
    expect(sessionDelete).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } });
  });

  it("removes email links a day after they were used or expired, not sooner", async () => {
    await cleanExpired(now);
    const dayAgo = new Date("2026-06-09T12:00:00Z");
    expect(tokenDelete).toHaveBeenCalledWith({ where: { OR: [{ expiresAt: { lt: dayAgo } }, { usedAt: { lt: dayAgo } }] } });
  });

  it("reports what it removed", async () => {
    expect(await cleanExpired(now)).toEqual({ sessions: 3, tokens: 2, signups: 1 });
    expect(signupDelete).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } });
  });
});
