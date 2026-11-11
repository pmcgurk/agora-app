import { describe, expect, it } from "vitest";
import { emailThemeFor } from "@/lib/email-theme";
import * as templates from "@/lib/email-templates";

const theme = emailThemeFor({ themeName: "light" });
const brand = { siteName: "Paul’s Pots", theme, logoUrl: "https://blog.example.com/api/avatar/c1" };
const EVIL = '<script>alert(1)</script>"><img src=x onerror=alert(1)>';

// One message from every template, with hostile text in every place a person's words can land.
const all = () => [
  templates.invitationEmail({ ...brand, to: "a@example.com", inviteeName: EVIL, inviterName: EVIL, url: "https://x.test/invite/t" }),
  templates.applicationReceivedEmail({ ...brand, to: "a@example.com", applicantName: EVIL, applicantEmail: "x@example.com", url: "https://x.test/a" }),
  templates.applicationApprovedEmail({ ...brand, to: "a@example.com", name: EVIL, url: "https://x.test/login" }),
  templates.applicationRejectedEmail({ ...brand, to: "a@example.com", name: EVIL }),
  templates.passwordResetEmail({ ...brand, to: "a@example.com", name: EVIL, url: "https://x.test/reset/t", minutes: 60 }),
  templates.verifyEmailEmail({ ...brand, to: "a@example.com", name: EVIL, url: "https://x.test/verify/t", days: 7 }),
  templates.finishSignupEmail({ ...brand, to: "a@example.com", name: EVIL, url: "https://x.test/signup/finish/t", hours: 24 }),
  templates.alreadyRegisteredEmail({ ...brand, to: "a@example.com", name: EVIL, loginUrl: "https://x.test/login", resetUrl: "https://x.test/forgot" }),
  templates.confirmEmailChangeEmail({ ...brand, to: "a@example.com", name: EVIL, url: "https://x.test/confirm/t", hours: 24 }),
  templates.emailChangedNoticeEmail({ ...brand, to: "a@example.com", name: EVIL, newEmail: "n@example.com", resetUrl: "https://x.test/forgot" }),
  templates.emailInUseNoticeEmail({ ...brand, to: "a@example.com", loginUrl: "https://x.test/login" }),
  templates.accountDeletedEmail({ ...brand, to: "a@example.com", name: EVIL }),
  templates.paymentFailedEmail({ ...brand, to: "a@example.com", name: EVIL, creatorName: EVIL, tierName: EVIL, graceDays: 7, url: "https://x.test/settings/subscriptions" }),
  templates.membershipEndedEmail({ ...brand, to: "a@example.com", name: EVIL, creatorName: EVIL, tierName: EVIL, url: "https://x.test/creators/c" }),
  templates.receiptEmail({ ...brand, to: "a@example.com", name: EVIL, creatorName: EVIL, description: EVIL, amount: "£5.00", date: "2026-11-10", receiptUrl: "https://invoice.stripe.com/i/1" }),
  templates.refundEmail({ ...brand, to: "a@example.com", name: EVIL, creatorName: EVIL, description: EVIL, amount: "£5.00" }),
  templates.newPostEmail({
    ...brand,
    to: "a@example.com",
    creatorName: EVIL,
    title: EVIL,
    excerpt: EVIL,
    postUrl: "https://x.test/posts/p",
    unsubscribeUrl: "https://x.test/unsubscribe/t",
    oneClickUnsubscribeUrl: "https://x.test/api/unsubscribe/t",
  }),
  templates.testEmail({ ...brand, to: "a@example.com" }),
];

describe("every email", () => {
  it("escapes whatever a person typed, in every place it appears", () => {
    for (const message of all()) {
      expect(message.html, message.subject).not.toContain("<script>");
      expect(message.html, message.subject).not.toContain("<img src=x");
    }
  });

  it("is a full, valid page with a plain-text twin and a subject", () => {
    for (const message of all()) {
      expect(message.subject.length).toBeGreaterThan(5);
      expect(message.html.startsWith("<!doctype html>")).toBe(true);
      expect(message.html).toContain('lang="en"');
      expect(message.text.length).toBeGreaterThan(20);
    }
  });

  it("is in the creator's colours and fonts, inline", () => {
    for (const message of all()) {
      expect(message.html).toContain(theme.primary);
      expect(message.html).toContain(theme.surface);
      expect(message.html).not.toContain("var(--");
      expect(message.html).not.toContain("class=");
    }
  });

  it("shows the creator's picture and the site name in the header", () => {
    const html = all()[0].html;
    expect(html).toContain('src="https://blog.example.com/api/avatar/c1"');
    expect(html).toContain("Paul’s Pots");
  });

  it("has a readable fallback look without a theme", () => {
    const message = templates.testEmail({ to: "a@example.com", siteName: "Plain" });
    expect(message.html).toContain("#6d28d9");
  });

  it("puts its button link in both the HTML and the text, so a plain-text reader can follow it", () => {
    const reset = templates.passwordResetEmail({ ...brand, to: "a@example.com", name: "Sam", url: "https://x.test/reset/abc", minutes: 60 });
    expect(reset.html).toContain('href="https://x.test/reset/abc"');
    expect(reset.text).toContain("Choose a new password: https://x.test/reset/abc");
  });

  it("has a hidden preview line for the inbox list", () => {
    const reset = templates.passwordResetEmail({ ...brand, to: "a@example.com", name: "Sam", url: "https://x.test/r", minutes: 60 });
    expect(reset.html).toContain("display:none");
    expect(reset.html).toContain("someone asked to reset the password");
  });
});

describe("receipts", () => {
  it("lay the details out as a table of facts", () => {
    const message = templates.receiptEmail({ ...brand, to: "a@example.com", name: "Sam", creatorName: "Paul", description: "Gold membership", amount: "£12.00", date: "2026-11-10", receiptUrl: null });
    expect(message.text).toContain("Amount: £12.00");
    expect(message.text).toContain("For: Gold membership");
    expect(message.html).toContain("£12.00");
    expect(message.html).not.toContain("View receipt");
  });
});

describe("new post emails", () => {
  const base = {
    ...brand,
    to: "a@example.com",
    creatorName: "Paul",
    title: "Hello world",
    excerpt: "A short taste.",
    postUrl: "https://x.test/posts/hello",
    unsubscribeUrl: "https://x.test/unsubscribe/t",
    oneClickUnsubscribeUrl: "https://x.test/api/unsubscribe/t",
  };

  it("show the creator in the header and a byline with the date", () => {
    const message = templates.newPostEmail({ ...base, publishedOn: "10 November 2026" });
    expect(message.html).toContain(">Paul<");
    expect(message.html).toContain("By Paul · 10 November 2026");
  });

  it("send a short excerpt with a button by default", () => {
    const message = templates.newPostEmail(base);
    expect(message.html).toContain("A short taste.");
    expect(message.html).toContain("Read the post");
    expect(message.text).toContain("Read the post: https://x.test/posts/hello");
  });

  it("carry the whole post when the creator sends the full post", () => {
    const message = templates.newPostEmail({ ...base, body: { html: "<p>The whole thing.</p>", text: "The whole thing." } });
    expect(message.html).toContain("<p>The whole thing.</p>");
    expect(message.text).toContain("The whole thing.");
    expect(message.text).not.toContain("A short taste.");
    expect(message.html).toContain("Read it on the site");
  });

  it("always have an unsubscribe link and the one-click headers", () => {
    const message = templates.newPostEmail(base);
    expect(message.html).toContain('href="https://x.test/unsubscribe/t"');
    expect(message.text).toContain("Unsubscribe: https://x.test/unsubscribe/t");
    expect(message.headers).toEqual({
      "List-Unsubscribe": "<https://x.test/api/unsubscribe/t>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("say replies are welcome only when the creator chose an address for them", () => {
    expect(templates.newPostEmail(base).text).not.toContain("reply");
    const message = templates.newPostEmail({ ...base, replyNote: "You can reply to this email to write to Paul." });
    expect(message.text).toContain("You can reply to this email to write to Paul.");
  });
});
