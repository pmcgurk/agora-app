import type { Brand } from "@/lib/email-templates";
import * as templates from "@/lib/email-templates";
import type { MailMessage } from "@/lib/mail";

// Example versions of the site's emails, with made-up names and links, for the preview page. The newsletter is not
// here: it is built from one of the creator's real posts (see lib/newsletter.ts).

export const SYSTEM_EMAIL_KINDS = [
  { key: "signup", label: "Finish signing up" },
  { key: "reset", label: "Password reset" },
  { key: "verify", label: "Confirm your email" },
  { key: "email-change", label: "Confirm a new email address" },
  { key: "already", label: "Already has an account" },
  { key: "receipt", label: "Receipt" },
  { key: "refund", label: "Refund" },
  { key: "payment-failed", label: "Payment failed" },
  { key: "membership-ended", label: "Membership ended" },
  { key: "test", label: "Test email" },
] as const;

export type SystemEmailKind = (typeof SYSTEM_EMAIL_KINDS)[number]["key"];

export const isSystemEmailKind = (value: unknown): value is SystemEmailKind => SYSTEM_EMAIL_KINDS.some((kind) => kind.key === value);

const SAMPLE_URL = "https://example.com";

export function sampleEmail(kind: SystemEmailKind, brand: Brand, to: string): MailMessage {
  const base = { ...brand, to };
  const name = "Sam";
  switch (kind) {
    case "signup":
      return templates.finishSignupEmail({ ...base, name, url: `${SAMPLE_URL}/signup/finish/example`, hours: 24 });
    case "reset":
      return templates.passwordResetEmail({ ...base, name, url: `${SAMPLE_URL}/reset-password/example`, minutes: 60 });
    case "verify":
      return templates.verifyEmailEmail({ ...base, name, url: `${SAMPLE_URL}/verify-email/example`, days: 7 });
    case "email-change":
      return templates.confirmEmailChangeEmail({ ...base, name, url: `${SAMPLE_URL}/confirm-email-change/example`, hours: 24 });
    case "already":
      return templates.alreadyRegisteredEmail({ ...base, name, loginUrl: `${SAMPLE_URL}/login`, resetUrl: `${SAMPLE_URL}/forgot-password` });
    case "receipt":
      return templates.receiptEmail({
        ...base,
        name,
        creatorName: brand.headerName ?? brand.siteName,
        description: "Supporter membership",
        amount: "$8.00",
        date: new Date().toISOString().slice(0, 10),
        receiptUrl: `${SAMPLE_URL}/receipt/example`,
      });
    case "refund":
      return templates.refundEmail({ ...base, name, creatorName: brand.headerName ?? brand.siteName, description: "Supporter membership", amount: "$8.00" });
    case "payment-failed":
      return templates.paymentFailedEmail({
        ...base,
        name,
        creatorName: brand.headerName ?? brand.siteName,
        tierName: "Supporter",
        graceDays: 7,
        url: `${SAMPLE_URL}/settings/subscriptions`,
      });
    case "membership-ended":
      return templates.membershipEndedEmail({
        ...base,
        name,
        creatorName: brand.headerName ?? brand.siteName,
        tierName: "Supporter",
        url: SAMPLE_URL,
      });
    case "test":
      return templates.testEmail(base);
  }
}
