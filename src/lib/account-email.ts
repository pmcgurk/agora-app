import { createEmailToken, TOKEN_LIFETIME_MS } from "@/lib/email-tokens";
import { alreadyRegisteredEmail, finishSignupEmail, passwordResetEmail, verifyEmailEmail } from "@/lib/email-templates";
import { createPendingSignup, SIGNUP_LINK_LIFETIME_MS } from "@/lib/pending-signups";
import { siteName } from "@/lib/instance";
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
      siteName: await siteName(),
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
      siteName: await siteName(),
      name: user.name,
      url: publicUrl(`/verify-email/${token}`),
      days: TOKEN_LIFETIME_MS.VERIFY_EMAIL / (24 * 60 * 60 * 1000),
    }),
  );
}

// Sent to an address that asked to sign up: a link that creates the account when its owner opens it.
export async function sendFinishSignupEmail(email: string, name: string): Promise<void> {
  const token = await createPendingSignup(email, name);
  await sendMail(
    finishSignupEmail({
      to: email,
      siteName: await siteName(),
      name,
      url: publicUrl(`/signup/finish/${token}`),
      hours: SIGNUP_LINK_LIFETIME_MS / (60 * 60 * 1000),
    }),
  );
}

// Sent instead, when the address already has an account, so the answer on screen can be the same either way.
export async function sendAlreadyRegisteredEmail(user: Recipient): Promise<void> {
  await sendMail(
    alreadyRegisteredEmail({ to: user.email, siteName: await siteName(), name: user.name, loginUrl: publicUrl("/login"), resetUrl: publicUrl("/forgot-password") }),
  );
}
