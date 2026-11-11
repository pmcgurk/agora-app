import { DEFAULT_EMAIL_THEME, type EmailTheme } from "@/lib/email-theme";
import { escapeHtml as esc } from "@/lib/html-escape";
import type { MailMessage } from "@/lib/mail";

// Every email is built the same way: a small branded card in the colours and fonts of the creator's blog, with
// a plain-text twin. Email clients ignore classes and most stylesheets, so everything is written inline, with
// tables for layout. Values are escaped before they reach HTML.

// Who the email is from, as the reader sees it. Without a theme, the default look is used.
export type Brand = {
  siteName: string;
  theme?: EmailTheme;
  // The creator's picture, shown beside the name. Left out when it could not load (a private site).
  logoUrl?: string | null;
  // The name in the header when it should not be the site's (a creator's newsletter shows the creator).
  headerName?: string;
};

type Fact = [label: string, value: string];
type Action = { label: string; url: string };

type Card = {
  brand: Brand;
  title: string;
  // The grey line some inboxes show beside the subject.
  preheader?: string;
  paragraphs?: string[];
  // Safe HTML, already escaped (for example a post's body from renderEmailMarkdown).
  contentHtml?: string;
  byline?: string;
  facts?: Fact[];
  action?: Action;
  // Shown under the card. Plain text; use footerHtml when it needs a link.
  footer?: string;
  footerHtml?: string;
};

const WIDTH = 560;

function header(brand: Brand, theme: EmailTheme): string {
  const name = esc(brand.headerName ?? brand.siteName);
  const logo = brand.logoUrl
    ? `<td style="padding-right:12px;vertical-align:middle"><img src="${esc(brand.logoUrl)}" alt="" width="40" height="40" style="display:block;width:40px;height:40px;border-radius:50%;border:0;object-fit:cover"></td>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr>${logo}<td style="vertical-align:middle;font-family:${esc(theme.fontHeading)};font-size:18px;font-weight:700;color:${esc(theme.text)}">${name}</td></tr></table>`;
}

function button(action: Action, theme: EmailTheme): string {
  // A table cell with a background survives clients that strip padding and backgrounds from links.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px"><tr><td align="center" bgcolor="${esc(theme.primary)}" style="background:${esc(theme.primary)};border-radius:${theme.radiusPx}px"><a href="${esc(action.url)}" style="display:inline-block;padding:12px 24px;font-family:${esc(theme.fontBody)};font-size:16px;font-weight:600;line-height:1.2;color:${esc(theme.onPrimary)};text-decoration:none;border-radius:${theme.radiusPx}px">${esc(action.label)}</a></td></tr></table>`;
}

export function layout(card: Card): string {
  const theme = card.brand.theme ?? DEFAULT_EMAIL_THEME;
  const body = (card.paragraphs ?? [])
    .map((paragraph) => `<p style="margin:0 0 16px;font-family:${esc(theme.fontBody)};font-size:16px;line-height:1.65;color:${esc(theme.text)}">${esc(paragraph)}</p>`)
    .join("");
  const facts = card.facts?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 16px;border-top:1px solid ${esc(theme.border)}">${card.facts
        .map(
          ([label, value]) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid ${esc(theme.border)};font-family:${esc(theme.fontBody)};font-size:14px;color:${esc(theme.muted)}">${esc(label)}</td><td align="right" style="padding:10px 0;border-bottom:1px solid ${esc(theme.border)};font-family:${esc(theme.fontBody)};font-size:15px;font-weight:600;color:${esc(theme.text)}">${esc(value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const byline = card.byline
    ? `<p style="margin:0 0 20px;font-family:${esc(theme.fontBody)};font-size:14px;color:${esc(theme.muted)}">${esc(card.byline)}</p>`
    : "";
  const action = card.action
    ? `${button(card.action, theme)}<p style="margin:12px 0 0;font-family:${esc(theme.fontBody)};font-size:13px;line-height:1.5;color:${esc(theme.muted)}">If the button doesn’t work, paste this link into your browser:<br><a href="${esc(card.action.url)}" style="color:${esc(theme.muted)};word-break:break-all">${esc(card.action.url)}</a></p>`
    : "";
  const footer = card.footerHtml ?? esc(card.footer ?? `Sent by ${card.brand.siteName}.`);
  const preheader = card.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${esc(theme.background)}">${esc(card.preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(card.title)}</title></head>
<body style="margin:0;padding:0;background:${esc(theme.background)}">${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${esc(theme.background)}" style="background:${esc(theme.background)}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px">
<tr><td style="padding:0 0 18px">${header(card.brand, theme)}</td></tr>
<tr><td style="padding:32px 28px;background:${esc(theme.surface)};border:1px solid ${esc(theme.border)};border-top:4px solid ${esc(theme.primary)};border-radius:${theme.radiusPx}px">
<h1 style="margin:0 0 ${card.byline ? "6" : "20"}px;font-family:${esc(theme.fontHeading)};font-size:24px;line-height:1.25;font-weight:700;color:${esc(theme.text)}">${esc(card.title)}</h1>
${byline}${body}${card.contentHtml ?? ""}${facts}${action}
</td></tr>
<tr><td align="center" style="padding:18px 12px 0;font-family:${esc(theme.fontBody)};font-size:12px;line-height:1.6;color:${esc(theme.muted)}">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

// The same message as plain text. Some readers prefer it and every spam filter checks that it exists.
export function plainText(card: Pick<Card, "title" | "paragraphs" | "facts" | "action" | "footer" | "byline"> & { contentText?: string; brand: Brand }): string {
  return [
    card.title,
    ...(card.byline ? [card.byline] : []),
    ...(card.paragraphs ?? []),
    ...(card.contentText ? [card.contentText] : []),
    ...(card.facts?.length ? [card.facts.map(([label, value]) => `${label}: ${value}`).join("\n")] : []),
    ...(card.action ? [`${card.action.label}: ${card.action.url}`] : []),
    ...(card.footer !== undefined ? [`--\n${card.footer}`] : [`--\nSent by ${card.brand.siteName}.`]),
  ].join("\n\n");
}

type Simple = { to: string } & Brand;

// A message built from short paragraphs and at most one button, which covers most of what the site sends.
function simple(
  input: Simple,
  subject: string,
  title: string,
  paragraphs: string[],
  action?: Action,
  options: { preheader?: string; footer?: string } = {},
): MailMessage {
  const card = { brand: input, title, paragraphs, action, preheader: options.preheader ?? paragraphs[0], footer: options.footer };
  return { to: input.to, subject, text: plainText(card), html: layout(card) };
}

export function invitationEmail(input: Simple & { inviteeName: string; inviterName: string; url: string }): MailMessage {
  return simple(
    input,
    `You’re invited to ${input.siteName}`,
    "You’re invited",
    [
      `Hi ${input.inviteeName}, ${input.inviterName} has invited you to create a creator account on ${input.siteName}.`,
      "The link works once and expires in 7 days. Set a password and you can set up your page.",
    ],
    { label: "Accept your invitation", url: input.url },
  );
}

export function applicationReceivedEmail(input: Simple & { applicantName: string; applicantEmail: string; url: string }): MailMessage {
  return simple(
    input,
    `New creator application from ${input.applicantName}`,
    "New creator application",
    [`${input.applicantName} (${input.applicantEmail}) has applied for a creator account.`, "Review the application in Settings > Creators."],
    { label: "Review applications", url: input.url },
  );
}

export function applicationApprovedEmail(input: Simple & { name: string; url: string }): MailMessage {
  return simple(
    input,
    `Your ${input.siteName} application was approved`,
    "You’re approved",
    [`Good news, ${input.name}. Your creator application for ${input.siteName} was approved.`, "Sign in to set up your page."],
    { label: "Sign in", url: input.url },
  );
}

export function applicationRejectedEmail(input: Simple & { name: string }): MailMessage {
  return simple(input, `Your ${input.siteName} application`, "About your application", [
    `Hi ${input.name}, thanks for applying to ${input.siteName}. This time we can’t open a creator account for you.`,
  ]);
}

export function passwordResetEmail(input: Simple & { name: string; url: string; minutes: number }): MailMessage {
  return simple(
    input,
    `Reset your ${input.siteName} password`,
    "Reset your password",
    [
      `Hi ${input.name}, someone asked to reset the password for your ${input.siteName} account.`,
      `The link works once and expires in ${input.minutes} minutes. If it wasn’t you, ignore this email and your password stays as it is.`,
    ],
    { label: "Choose a new password", url: input.url },
  );
}

export function verifyEmailEmail(input: Simple & { name: string; url: string; days: number }): MailMessage {
  return simple(
    input,
    `Confirm your email for ${input.siteName}`,
    "Confirm your email",
    [`Hi ${input.name}, confirm your email address to comment and send messages on ${input.siteName}.`, `The link expires in ${input.days} days.`],
    { label: "Confirm my email", url: input.url },
  );
}

export function finishSignupEmail(input: Simple & { name: string; url: string; hours: number }): MailMessage {
  return simple(
    input,
    `Finish signing up to ${input.siteName}`,
    "Finish signing up",
    [
      `Hi ${input.name}, thanks for signing up to ${input.siteName}. Open the link to choose a password and finish creating your account.`,
      `The link works once and expires in ${input.hours} hours. If you didn’t ask for this, ignore this email and nothing will be created.`,
    ],
    { label: "Finish signing up", url: input.url },
  );
}

export function alreadyRegisteredEmail(input: Simple & { name: string; loginUrl: string; resetUrl: string }): MailMessage {
  return simple(
    input,
    `You already have an account on ${input.siteName}`,
    "You already have an account",
    [
      `Hi ${input.name}, someone (hopefully you) tried to sign up to ${input.siteName} with this email address, but it already has an account.`,
      `You can log in with it. If you’ve forgotten your password, you can reset it: ${input.resetUrl}`,
      "If it wasn’t you, you can ignore this email. Nothing has changed on your account.",
    ],
    { label: "Log in", url: input.loginUrl },
  );
}

export function confirmEmailChangeEmail(input: Simple & { name: string; url: string; hours: number }): MailMessage {
  return simple(
    input,
    `Confirm your new email for ${input.siteName}`,
    "Confirm your new email",
    [
      `Hi ${input.name}, you asked to use this address for your ${input.siteName} account. Open the link to confirm it.`,
      `The link works once and expires in ${input.hours} hours. Until you open it, your account keeps its current address. If it wasn’t you, ignore this email.`,
    ],
    { label: "Confirm this email address", url: input.url },
  );
}

export function emailChangedNoticeEmail(input: Simple & { name: string; newEmail: string; resetUrl: string }): MailMessage {
  return simple(input, `Your ${input.siteName} email address was changed`, "Your email address was changed", [
    `Hi ${input.name}, the email address on your ${input.siteName} account was changed to ${input.newEmail}.`,
    `If that was you, nothing more to do. If it wasn’t, someone else has access to your account: reset your password straight away at ${input.resetUrl}`,
  ]);
}

export function emailInUseNoticeEmail(input: Simple & { loginUrl: string }): MailMessage {
  return simple(
    input,
    `About your ${input.siteName} email address`,
    "About your email address",
    [
      `Someone tried to move another ${input.siteName} account to this email address, but it already belongs to an account here.`,
      "If that was you, log in to the account you want to keep. If not, you can ignore this email: nothing has changed.",
    ],
    { label: "Log in", url: input.loginUrl },
  );
}

export function accountDeletedEmail(input: Simple & { name: string }): MailMessage {
  return simple(input, `Your ${input.siteName} account was deleted`, "Your account was deleted", [
    `Hi ${input.name}, your ${input.siteName} account has been deleted, along with your memberships, likes and messages. Paid memberships were cancelled.`,
    "If you didn’t do this, reply to the site owner straight away.",
  ]);
}

// Sent once, when a renewal payment fails. Access carries on for a few days while the card is fixed or retried.
export function paymentFailedEmail(input: Simple & { name: string; creatorName: string; tierName: string; graceDays: number; url: string }): MailMessage {
  return simple(
    input,
    `Your ${input.siteName} payment didn’t go through`,
    "Your payment didn’t go through",
    [
      `Hi ${input.name}, we couldn’t take the payment for your ${input.tierName} membership of ${input.creatorName}.`,
      `Your access carries on for ${input.graceDays} days while the payment is retried. To keep your membership, update your card now.`,
    ],
    { label: "Update my card", url: input.url },
  );
}

// Sent when the retries run out and the membership ends because of the failed payment.
export function membershipEndedEmail(input: Simple & { name: string; creatorName: string; tierName: string; url: string }): MailMessage {
  return simple(
    input,
    `Your ${input.creatorName} membership has ended`,
    "Your membership has ended",
    [`Hi ${input.name}, your ${input.tierName} membership of ${input.creatorName} has ended because the payment could not be taken.`, "You can join again at any time."],
    { label: `Visit ${input.creatorName}`, url: input.url },
  );
}

// A receipt for a payment: a renewal, a first payment or a tip. The hosted invoice has the tax detail.
export function receiptEmail(input: Simple & {
  name: string;
  creatorName: string;
  description: string;
  amount: string;
  date: string;
  receiptUrl: string | null;
}): MailMessage {
  const card: Card = {
    brand: input,
    title: "Your receipt",
    preheader: `${input.amount} to ${input.creatorName}. Thank you.`,
    paragraphs: [`Hi ${input.name}, thank you. Here is your receipt.`],
    facts: [
      ["For", input.description],
      ["To", input.creatorName],
      ["Amount", input.amount],
      ["Date", input.date],
    ],
    action: input.receiptUrl ? { label: "View receipt", url: input.receiptUrl } : undefined,
  };
  return { to: input.to, subject: `Your ${input.siteName} receipt: ${input.amount}`, text: plainText(card), html: layout(card) };
}

// Sent when a payment is refunded in full. The money usually reaches the card within a week or so.
export function refundEmail(input: Simple & { name: string; creatorName: string; description: string; amount: string }): MailMessage {
  const card: Card = {
    brand: input,
    title: "Your refund",
    preheader: `${input.amount} is on its way back to you.`,
    paragraphs: [`Hi ${input.name}, ${input.amount} has been refunded to you for: ${input.description} (${input.creatorName}).`, "It can take 5 to 10 days to show on your statement, depending on your bank."],
    facts: [
      ["For", input.description],
      ["Refunded", input.amount],
    ],
  };
  return { to: input.to, subject: `Your ${input.siteName} refund: ${input.amount}`, text: plainText(card), html: layout(card) };
}

// The email a member gets when a creator they follow publishes. Every one carries a one-click unsubscribe.
// With `body`, the whole post is in the email (a newsletter); without it, a short excerpt and a button.
export function newPostEmail(input: Simple & {
  creatorName: string;
  title: string;
  excerpt: string;
  postUrl: string;
  unsubscribeUrl: string;
  oneClickUnsubscribeUrl: string;
  // The post's text as email, when the creator sends the full post.
  body?: { html: string; text: string } | null;
  publishedOn?: string;
  // A line saying members can write back, when the creator has chosen an address for replies.
  replyNote?: string | null;
}): MailMessage {
  const theme = input.theme ?? DEFAULT_EMAIL_THEME;
  const full = input.body ?? null;
  const reason = `You get this because you asked for emails when ${input.creatorName} posts on ${input.siteName}.`;
  const footerText = [reason, ...(input.replyNote ? [input.replyNote] : []), `Unsubscribe: ${input.unsubscribeUrl}`].join("\n");
  const footerHtml = `${esc(reason)}${input.replyNote ? `<br>${esc(input.replyNote)}` : ""}<br><a href="${esc(input.unsubscribeUrl)}" style="color:${esc(theme.muted)};text-decoration:underline">Unsubscribe</a>`;
  const byline = [`By ${input.creatorName}`, input.publishedOn].filter(Boolean).join(" · ");
  const card: Card & { contentText?: string } = {
    brand: { ...input, headerName: input.creatorName },
    title: input.title,
    byline,
    preheader: input.excerpt || undefined,
    paragraphs: full ? undefined : input.excerpt ? [input.excerpt] : undefined,
    contentHtml: full?.html,
    contentText: full?.text,
    action: { label: full ? "Read it on the site" : "Read the post", url: input.postUrl },
    footerHtml,
  };
  return {
    to: input.to,
    subject: `New post: ${input.title}`,
    text: plainText({ ...card, contentText: full?.text, footer: footerText }),
    html: layout(card),
    headers: {
      "List-Unsubscribe": `<${input.oneClickUnsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export function testEmail(input: Simple): MailMessage {
  return simple(input, `Test email from ${input.siteName}`, "Email is working", [
    `This is a test email from ${input.siteName}. If you can read it, outgoing mail works.`,
  ]);
}
