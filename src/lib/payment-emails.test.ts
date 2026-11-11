import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, getMailSettings, sendMail } = vi.hoisted(() => ({
  prisma: {
    subscription: { findUnique: vi.fn() },
    payment: { findMany: vi.fn() },
  },
  getMailSettings: vi.fn(),
  sendMail: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/mail", () => ({ getMailSettings, sendMail }));
vi.mock("@/lib/instance", () => ({ siteName: async () => "Test Site" }));

import { sendMembershipEndedNotice, sendPaymentFailedNotice, sendReceipt, sendRefundNotices } from "@/lib/payment-emails";

const plan = {
  patron: { name: "Sam", email: "sam@example.com" },
  tier: { name: "Gold", creator: { id: "c1", name: "Paul", slug: "paul" } },
};

beforeEach(() => {
  vi.resetAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = "https://blog.example.com";
  getMailSettings.mockResolvedValue({ host: "smtp.example.com" });
  sendMail.mockResolvedValue({ ok: true });
  prisma.subscription.findUnique.mockResolvedValue(plan);
});

describe("failing card notices", () => {
  it("tells the patron how long they have and links to where they can fix the card", async () => {
    await sendPaymentFailedNotice("s1", 7);
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe("sam@example.com");
    expect(message.subject).toContain("payment didn");
    expect(message.text).toContain("Gold membership of Paul");
    expect(message.text).toContain("7 days");
    expect(message.text).toContain("https://blog.example.com/settings/subscriptions");
  });

  it("says the membership ended, with a link back to the creator", async () => {
    await sendMembershipEndedNotice("s1");
    const message = sendMail.mock.calls[0][0];
    expect(message.subject).toBe("Your Paul membership has ended");
    expect(message.text).toContain("https://blog.example.com/");
  });

  it("sends nothing when the plan is gone", async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    await sendPaymentFailedNotice("s1", 7);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("receipts", () => {
  const receipt = {
    to: "sam@example.com",
    name: "Sam",
    creatorName: "Paul",
    description: "Gold membership",
    amount: 1200,
    currency: "gbp",
    date: new Date("2026-11-10T12:00:00Z"),
    receiptUrl: "https://invoice.stripe.com/i/1",
  };

  it("shows the amount in the right currency, the date and the invoice link", async () => {
    await sendReceipt(receipt);
    const message = sendMail.mock.calls[0][0];
    expect(message.subject).toContain("£12.00");
    expect(message.text).toContain("Date: 2026-11-10");
    expect(message.text).toContain("https://invoice.stripe.com/i/1");
  });

  it("works without an invoice link, as for a tip", async () => {
    await sendReceipt({ ...receipt, receiptUrl: null });
    expect(sendMail.mock.calls[0][0].text).not.toContain("View receipt");
  });

  it("sends nothing when there is nobody to send it to", async () => {
    await sendReceipt({ ...receipt, to: null });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("escapes names in the HTML version", async () => {
    await sendReceipt({ ...receipt, creatorName: "<script>x</script>" });
    expect(sendMail.mock.calls[0][0].html).not.toContain("<script>x");
  });
});

describe("refund notices", () => {
  it("emails each refunded patron and skips payments with no account", async () => {
    prisma.payment.findMany.mockResolvedValue([
      { kind: "SUBSCRIPTION", amount: 1200, currency: "GBP", patron: { name: "Sam", email: "sam@example.com" }, tier: { name: "Gold" }, creator: { name: "Paul" } },
      { kind: "TIP", amount: 500, currency: "GBP", patron: null, tier: null, creator: { name: "Paul" } },
    ]);
    await sendRefundNotices(["p1", "p2"]);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].text).toContain("£12.00 has been refunded");
  });
});

describe("never getting in the way of a webhook", () => {
  it("does nothing on a site with no email set up", async () => {
    getMailSettings.mockResolvedValue(null);
    await sendPaymentFailedNotice("s1", 7);
    await sendRefundNotices(["p1"]);
    expect(sendMail).not.toHaveBeenCalled();
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  it("swallows a mail failure instead of throwing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sendMail.mockRejectedValue(new Error("SMTP down"));
    await expect(sendPaymentFailedNotice("s1", 7)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("swallows a database failure too", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    prisma.subscription.findUnique.mockRejectedValue(new Error("db"));
    await expect(sendMembershipEndedNotice("s1")).resolves.toBeUndefined();
    log.mockRestore();
  });
});
