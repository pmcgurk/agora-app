import type { MailMessage } from "@/lib/mail";

// Every email is plain text first, with a small HTML version. Values are escaped before they reach HTML.

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function layout(siteName: string, title: string, paragraphs: string[], action?: { label: string; url: string }): string {
  const body = paragraphs.map((text) => `<p style="margin:0 0 16px">${escape(text)}</p>`).join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escape(action.url)}" style="background:#6d28d9;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escape(action.label)}</a></p>
       <p style="margin:0;font-size:13px;color:#6b7280">If the button doesn't work, paste this link into your browser:<br>${escape(action.url)}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#171717;background:#f5f5f5;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
      <p style="margin:0 0 20px;font-weight:700;color:#6d28d9">${escape(siteName)}</p>
      <h1 style="font-size:20px;margin:0 0 16px">${escape(title)}</h1>
      ${body}${button}
    </div>
    <p style="text-align:center;color:#6b7280;font-size:12px;margin-top:16px">You received this because of activity on ${escape(siteName)}.</p>
  </body></html>`;
}

function text(paragraphs: string[], action?: { label: string; url: string }): string {
  return [...paragraphs, ...(action ? [`${action.label}: ${action.url}`] : [])].join("\n\n");
}

export function invitationEmail(input: { to: string; siteName: string; inviteeName: string; inviterName: string; url: string }): MailMessage {
  const paragraphs = [
    `Hi ${input.inviteeName}, ${input.inviterName} has invited you to create a creator account on ${input.siteName}.`,
    "The link works once and expires in 7 days. Set a password and you can set up your page.",
  ];
  const action = { label: "Accept your invitation", url: input.url };
  return {
    to: input.to,
    subject: `You're invited to ${input.siteName}`,
    text: text(paragraphs, action),
    html: layout(input.siteName, "You're invited", paragraphs, action),
  };
}

export function applicationReceivedEmail(input: { to: string; siteName: string; applicantName: string; applicantEmail: string; url: string }): MailMessage {
  const paragraphs = [
    `${input.applicantName} (${input.applicantEmail}) has applied for a creator account.`,
    "Review the application in Settings > Creators.",
  ];
  const action = { label: "Review applications", url: input.url };
  return {
    to: input.to,
    subject: `New creator application from ${input.applicantName}`,
    text: text(paragraphs, action),
    html: layout(input.siteName, "New creator application", paragraphs, action),
  };
}

export function applicationApprovedEmail(input: { to: string; siteName: string; name: string; url: string }): MailMessage {
  const paragraphs = [`Good news, ${input.name}. Your creator application for ${input.siteName} was approved.`, "Sign in to set up your page."];
  const action = { label: "Sign in", url: input.url };
  return {
    to: input.to,
    subject: `Your ${input.siteName} application was approved`,
    text: text(paragraphs, action),
    html: layout(input.siteName, "You're approved", paragraphs, action),
  };
}

export function applicationRejectedEmail(input: { to: string; siteName: string; name: string }): MailMessage {
  const paragraphs = [`Hi ${input.name}, thanks for applying to ${input.siteName}. This time we can't open a creator account for you.`];
  return {
    to: input.to,
    subject: `Your ${input.siteName} application`,
    text: text(paragraphs),
    html: layout(input.siteName, "About your application", paragraphs),
  };
}

export function passwordResetEmail(input: { to: string; siteName: string; name: string; url: string; minutes: number }): MailMessage {
  const paragraphs = [
    `Hi ${input.name}, someone asked to reset the password for your ${input.siteName} account.`,
    `The link works once and expires in ${input.minutes} minutes. If it wasn't you, ignore this email and your password stays as it is.`,
  ];
  const action = { label: "Choose a new password", url: input.url };
  return {
    to: input.to,
    subject: `Reset your ${input.siteName} password`,
    text: text(paragraphs, action),
    html: layout(input.siteName, "Reset your password", paragraphs, action),
  };
}

export function verifyEmailEmail(input: { to: string; siteName: string; name: string; url: string; days: number }): MailMessage {
  const paragraphs = [
    `Hi ${input.name}, confirm your email address to comment and send messages on ${input.siteName}.`,
    `The link expires in ${input.days} days.`,
  ];
  const action = { label: "Confirm my email", url: input.url };
  return {
    to: input.to,
    subject: `Confirm your email for ${input.siteName}`,
    text: text(paragraphs, action),
    html: layout(input.siteName, "Confirm your email", paragraphs, action),
  };
}

export function finishSignupEmail(input: { to: string; siteName: string; name: string; url: string; hours: number }): MailMessage {
  const paragraphs = [
    `Hi ${input.name}, thanks for signing up to ${input.siteName}. Open the link to choose a password and finish creating your account.`,
    `The link works once and expires in ${input.hours} hours. If you didn’t ask for this, ignore this email and nothing will be created.`,
  ];
  const action = { label: "Finish signing up", url: input.url };
  return {
    to: input.to,
    subject: `Finish signing up to ${input.siteName}`,
    text: text(paragraphs, action),
    html: layout(input.siteName, "Finish signing up", paragraphs, action),
  };
}

export function alreadyRegisteredEmail(input: { to: string; siteName: string; name: string; loginUrl: string; resetUrl: string }): MailMessage {
  const paragraphs = [
    `Hi ${input.name}, someone (hopefully you) tried to sign up to ${input.siteName} with this email address, but it already has an account.`,
    `You can log in with it. If you’ve forgotten your password, you can reset it: ${input.resetUrl}`,
    "If it wasn’t you, you can ignore this email. Nothing has changed on your account.",
  ];
  const action = { label: "Log in", url: input.loginUrl };
  return {
    to: input.to,
    subject: `You already have an account on ${input.siteName}`,
    text: text(paragraphs, action),
    html: layout(input.siteName, "You already have an account", paragraphs, action),
  };
}

export function testEmail(input: { to: string; siteName: string }): MailMessage {
  const paragraphs = [`This is a test email from ${input.siteName}. If you can read it, outgoing mail works.`];
  return {
    to: input.to,
    subject: `Test email from ${input.siteName}`,
    text: text(paragraphs),
    html: layout(input.siteName, "Email is working", paragraphs),
  };
}
