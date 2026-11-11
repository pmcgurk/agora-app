import { createEmailToken, TOKEN_LIFETIME_MS } from "@/lib/email-tokens";
import {
  accountDeletedEmail,
  alreadyRegisteredEmail,
  confirmEmailChangeEmail,
  emailChangedNoticeEmail,
  emailInUseNoticeEmail,
  finishSignupEmail,
  passwordResetEmail,
  verifyEmailEmail,
} from "@/lib/email-templates";
import { createPendingSignup, SIGNUP_LINK_LIFETIME_MS } from "@/lib/pending-signups";
import { emailBrand } from "@/lib/email-brand";
import { getMailSettings, sendMail } from "@/lib/mail";
import { publicUrl } from "@/lib/urls";

type Recipient = { id: string; name: string; email: string };

// Confirming addresses and resetting passwords both need email. A site with no mail set up cannot send
// links, so it does not ask people to click them (resets then go through the owner, see the docs).
export async function mailIsConfigured(): Promise<boolean> {
  return (await getMailSettings()) !== null;
}

// Whether this user still has to confirm their address before commenting or messaging.
export async function needsVerification(user: { emailVerifiedAt: Date | null }): Promise<boolean> {
  return user.emailVerifiedAt === null && (await mailIsConfigured());
}

export async function sendPasswordResetEmail(user: Recipient): Promise<void> {
  const token = await createEmailToken(user.id, "PASSWORD_RESET");
  await sendMail(
    passwordResetEmail({
      to: user.email,
      ...(await emailBrand()),
      name: user.name,
      url: publicUrl(`/reset-password/${token}`),
      minutes: TOKEN_LIFETIME_MS.PASSWORD_RESET / 60_000,
    }),
  );
}

export async function sendVerificationEmail(user: Recipient): Promise<void> {
  const token = await createEmailToken(user.id, "VERIFY_EMAIL");
  await sendMail(
    verifyEmailEmail({
      to: user.email,
      ...(await emailBrand()),
      name: user.name,
      url: publicUrl(`/verify-email/${token}`),
      days: TOKEN_LIFETIME_MS.VERIFY_EMAIL / (24 * 60 * 60 * 1000),
    }),
  );
}

// Sent to an address that asked to sign up: a link that creates the account when its owner opens it.
export async function sendFinishSignupEmail(email: string, name: string, emailPosts = false): Promise<void> {
  const token = await createPendingSignup(email, name, emailPosts);
  await sendMail(
    finishSignupEmail({
      to: email,
      ...(await emailBrand()),
      name,
      url: publicUrl(`/signup/finish/${token}`),
      hours: SIGNUP_LINK_LIFETIME_MS / (60 * 60 * 1000),
    }),
  );
}

// Sent instead, when the address already has an account, so the answer on screen can be the same either way.
export async function sendAlreadyRegisteredEmail(user: Recipient): Promise<void> {
  await sendMail(
    alreadyRegisteredEmail({ to: user.email, ...(await emailBrand()), name: user.name, loginUrl: publicUrl("/login"), resetUrl: publicUrl("/forgot-password") }),
  );
}

type EmailChangeRecipient = Recipient & { email: string };

// The confirmation link goes to the NEW address and carries it, so the change only happens once its owner opens it.
export async function sendEmailChangeLink(user: EmailChangeRecipient, newEmail: string): Promise<void> {
  const token = await createEmailToken(user.id, "EMAIL_CHANGE", newEmail);
  await sendMail(
    confirmEmailChangeEmail({
      to: newEmail,
      ...(await emailBrand()),
      name: user.name,
      url: publicUrl(`/confirm-email-change/${token}`),
      hours: TOKEN_LIFETIME_MS.EMAIL_CHANGE / (60 * 60 * 1000),
    }),
  );
}

export async function sendEmailInUseNotice(address: string): Promise<void> {
  await sendMail(emailInUseNoticeEmail({ to: address, ...(await emailBrand()), loginUrl: publicUrl("/login") }));
}

// Told to the OLD address after a change, so a hijacked account cannot quietly move its email.
export async function sendEmailChangedNotice(oldEmail: string, user: { name: string }, newEmail: string): Promise<void> {
  await sendMail(emailChangedNoticeEmail({ to: oldEmail, ...(await emailBrand()), name: user.name, newEmail, resetUrl: publicUrl("/forgot-password") }));
}

export async function sendAccountDeletedNotice(user: { name: string; email: string }): Promise<void> {
  await sendMail(accountDeletedEmail({ to: user.email, ...(await emailBrand()), name: user.name }));
}
