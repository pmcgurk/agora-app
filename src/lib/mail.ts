import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";

// Outgoing email. The owner enters an SMTP server in Settings > Email; the MAIL_* environment
// variables are the fallback for hosts that prefer configuration as code. Without either, mail
// is skipped and the app keeps working (invites still show their link on screen).

export type MailSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  from: string;
};

// headers: extra mail headers, such as List-Unsubscribe on bulk mail.
export type MailMessage = { to: string; subject: string; text: string; html: string; headers?: Record<string, string> };

export type MailResult = { ok: true } | { ok: false; error: string };

function fromEnvironment(): MailSettings | null {
  const host = process.env.MAIL_HOST;
  const from = process.env.MAIL_FROM;
  if (!host || !from) return null;
  return {
    host,
    port: Number(process.env.MAIL_PORT) || 587,
    secure: process.env.MAIL_SECURE === "true",
    user: process.env.MAIL_USER || null,
    password: process.env.MAIL_PASSWORD || null,
    from,
  };
}

// Settings saved in the database win over the environment, so the owner can change them without a redeploy.
export async function getMailSettings(): Promise<MailSettings | null> {
  const row = await prisma.instanceSetting.findUnique({ where: { id: "instance" } });
  if (row?.smtpHost && row.mailFrom) {
    return {
      host: row.smtpHost,
      port: row.smtpPort ?? (row.smtpSecure ? 465 : 587),
      secure: row.smtpSecure,
      user: row.smtpUser,
      password: decryptSecret(row.smtpPassword, "smtpPassword"),
      from: row.mailFrom,
    };
  }
  return fromEnvironment();
}

export async function mailSource(): Promise<"database" | "environment" | "none"> {
  const row = await prisma.instanceSetting.findUnique({ where: { id: "instance" } });
  if (row?.smtpHost && row.mailFrom) return "database";
  return fromEnvironment() ? "environment" : "none";
}

function transportFor(settings: MailSettings) {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    // Port 465 uses TLS from the first byte; other ports upgrade with STARTTLS when the server offers it.
    secure: settings.secure,
    auth: settings.user ? { user: settings.user, pass: settings.password ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

// Never throws: a failed email must not break the action that triggered it. The caller decides what to show.
export async function sendMail(message: MailMessage, settings?: MailSettings | null): Promise<MailResult> {
  const config = settings === undefined ? await getMailSettings() : settings;
  if (!config) return { ok: false, error: "Email is not set up yet. Ask the site owner to configure it in Settings > Email." };
  try {
    await transportFor(config).sendMail({ from: config.from, ...message });
    return { ok: true };
  } catch (error) {
    // Log the reason for the operator, without credentials.
    console.error("Sending email failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "The email could not be sent. Check the mail settings and try again." };
  }
}

// Checks the connection and credentials without sending anything.
export async function verifyMailSettings(settings: MailSettings): Promise<MailResult> {
  try {
    await transportFor(settings).verify();
    return { ok: true };
  } catch (error) {
    console.error("Verifying mail settings failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Could not connect with these settings. Check the host, port, security and password." };
  }
}
