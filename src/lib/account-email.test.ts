import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMailSettings, sendMail, createEmailToken } = vi.hoisted(() => ({
  getMailSettings: vi.fn(),
  sendMail: vi.fn(),
  createEmailToken: vi.fn(),
}));

vi.mock("@/lib/mail", () => ({ getMailSettings, sendMail }));
vi.mock("@/lib/email-tokens", () => ({ createEmailToken, TOKEN_LIFETIME_MS: { PASSWORD_RESET: 3_600_000, VERIFY_EMAIL: 259_200_000 } }));
vi.mock("@/lib/instance", () => ({ siteName: async () => "Test Site" }));

import { mailIsConfigured, needsVerification, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/account-email";

const user = { id: "u1", name: "Sam", email: "sam@example.com" };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = "https://blog.example.com";
  createEmailToken.mockResolvedValue("TOKEN123");
  sendMail.mockResolvedValue({ ok: true });
});

describe("who has to confirm their email", () => {
  it("nobody, on a site that cannot send email (they could never confirm)", async () => {
    getMailSettings.mockResolvedValue(null);
    expect(await mailIsConfigured()).toBe(false);
    expect(await needsVerification({ emailVerifiedAt: null })).toBe(false);
  });

  it("anyone unconfirmed, once email is set up", async () => {
    getMailSettings.mockResolvedValue({ host: "smtp.example.com" });
    expect(await needsVerification({ emailVerifiedAt: null })).toBe(true);
  });

  it("not people who already confirmed", async () => {
    getMailSettings.mockResolvedValue({ host: "smtp.example.com" });
    expect(await needsVerification({ emailVerifiedAt: new Date() })).toBe(false);
  });
});

describe("the emails", () => {
  it("sends the reset link, built on the site's public address, to the account's own address", async () => {
    await sendPasswordResetEmail(user);
    expect(createEmailToken).toHaveBeenCalledWith("u1", "PASSWORD_RESET");
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe("sam@example.com");
    expect(message.text).toContain("https://blog.example.com/reset-password/TOKEN123");
    expect(message.html).toContain("https://blog.example.com/reset-password/TOKEN123");
    expect(message.text).toContain("60 minutes");
  });

  it("sends the confirmation link", async () => {
    await sendVerificationEmail(user);
    expect(createEmailToken).toHaveBeenCalledWith("u1", "VERIFY_EMAIL");
    expect(sendMail.mock.calls[0][0].text).toContain("https://blog.example.com/verify-email/TOKEN123");
  });

  it("escapes names in the HTML version", async () => {
    await sendPasswordResetEmail({ ...user, name: "<script>alert(1)</script>" });
    expect(sendMail.mock.calls[0][0].html).not.toContain("<script>");
  });
});
