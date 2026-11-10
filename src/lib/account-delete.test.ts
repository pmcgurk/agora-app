import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, endPlan, deleteObject, stripeConfigured, customersDel } = vi.hoisted(() => {
  const tx = {
    payment: { updateMany: vi.fn() },
    comment: { findMany: vi.fn(), updateMany: vi.fn() },
    user: { delete: vi.fn() },
  };
  return {
    prisma: {
      user: { findUnique: vi.fn(), upsert: vi.fn() },
      subscription: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
      tx,
    },
    endPlan: vi.fn(),
    deleteObject: vi.fn(),
    stripeConfigured: vi.fn(),
    customersDel: vi.fn(),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/subscriptions", () => ({ endPlan }));
vi.mock("@/lib/s3", () => ({ deleteObject }));
vi.mock("@/lib/payments", () => ({ stripeConfigured }));
vi.mock("@/lib/stripe", () => ({ getStripe: async () => ({ customers: { del: customersDel } }) }));

import { DELETED_USER_ID, deleteAccountData } from "@/lib/account-delete";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ avatarKey: "avatars/u1.webp", bannerKey: null, stripeCustomerId: null });
  stripeConfigured.mockResolvedValue(true);
  customersDel.mockResolvedValue({});
  prisma.subscription.findMany.mockResolvedValue([]);
  prisma.tx.comment.findMany.mockResolvedValue([]);
  deleteObject.mockResolvedValue(undefined);
});

describe("deleting an account", () => {
  it("ends every paid plan before touching any data", async () => {
    prisma.subscription.findMany.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
    await deleteAccountData("u1");
    expect(endPlan).toHaveBeenNthCalledWith(1, "s1", { atPeriodEnd: false });
    expect(endPlan).toHaveBeenNthCalledWith(2, "s2", { atPeriodEnd: false });
    expect(endPlan.mock.invocationCallOrder[0]).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0]);
  });

  it("deletes nothing if a plan cannot be ended (so nobody is billed for a deleted account)", async () => {
    prisma.subscription.findMany.mockResolvedValue([{ id: "s1" }]);
    endPlan.mockRejectedValue(new Error("Stripe is down"));
    await expect(deleteAccountData("u1")).rejects.toThrow("Stripe is down");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.tx.user.delete).not.toHaveBeenCalled();
  });

  it("keeps the creator's payment records but strips the member's name, message and link", async () => {
    await deleteAccountData("u1");
    expect(prisma.tx.payment.updateMany).toHaveBeenCalledWith({ where: { patronId: "u1" }, data: { patronId: null, tipperName: null, message: null } });
  });

  it("keeps comments that have replies as [deleted] and lets the rest go with the account", async () => {
    prisma.tx.comment.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    await deleteAccountData("u1");
    expect(prisma.tx.comment.findMany).toHaveBeenCalledWith({ where: { authorId: "u1", replies: { some: {} } }, select: { id: true } });
    expect(prisma.tx.comment.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["c1", "c2"] } }, data: { authorId: DELETED_USER_ID, body: "[deleted]" } });
    expect(prisma.tx.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("does not rewrite comments when none have replies", async () => {
    await deleteAccountData("u1");
    expect(prisma.tx.comment.updateMany).not.toHaveBeenCalled();
  });

  it("makes sure the placeholder account exists, and nobody can sign in to it", async () => {
    await deleteAccountData("u1");
    const call = prisma.user.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ id: DELETED_USER_ID });
    expect(call.create.passwordHash).toBe("!");
    expect(call.create.email).toMatch(/\.invalid$/);
  });

  it("removes their pictures from storage, and survives that failing", async () => {
    deleteObject.mockRejectedValue(new Error("bucket unreachable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(deleteAccountData("u1")).resolves.toBeUndefined();
    expect(deleteObject).toHaveBeenCalledWith("avatars/u1.webp");
  });

  it("removes the Stripe customer record, and carries on if that fails", async () => {
    prisma.user.findUnique.mockResolvedValue({ avatarKey: null, bannerKey: null, stripeCustomerId: "cus_1" });
    customersDel.mockRejectedValue(new Error("no such customer"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await deleteAccountData("u1");
    expect(customersDel).toHaveBeenCalledWith("cus_1");
    expect(prisma.tx.user.delete).toHaveBeenCalled();
  });

  it("does nothing for an account that no longer exists", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await deleteAccountData("gone");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
