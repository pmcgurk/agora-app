"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteCreator, isInstanceOwner } from "@/lib/instance";
import { sendMail, verifyMailSettings, type MailSettings } from "@/lib/mail";
import { testEmail } from "@/lib/email-templates";
import { prisma } from "@/lib/prisma";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST_PATTERN = /^[A-Za-z0-9.-]{1,255}$/;
const SETTINGS = "/settings/email";

// Returned to the form instead of redirecting, so the typed values stay on screen after an error.
export type MailFormState = { error?: string; notice?: string };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function back(message: string, kind: "notice" | "error" = "notice"): never {
  redirect(`${SETTINGS}?${kind}=${encodeURIComponent(message)}`);
}

async function requireOwner() {
  const user = await requireUser("CREATOR");
  if (!(await isInstanceOwner(user.id))) redirect("/dashboard");
  return user;
}

// Reads the form into settings. A blank password keeps the one already saved.
async function settingsFromForm(formData: FormData): Promise<MailSettings | string> {
  const host = text(formData, "smtpHost");
  const portInput = text(formData, "smtpPort");
  const port = portInput ? Number(portInput) : 587;
  const from = text(formData, "mailFrom");
  if (!HOST_PATTERN.test(host)) return "Enter the mail server's host name, for example smtp.example.com.";
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "The port must be a number from 1 to 65535.";
  if (!EMAIL_PATTERN.test(from) || from.length > 254) return "Enter the address emails come from, for example hello@example.com.";
  const existing = await prisma.instanceSetting.findUnique({ where: { id: "instance" }, select: { smtpPassword: true } });
  const typedPassword = String(formData.get("smtpPassword") ?? "");
  return {
    host,
    port,
    secure: formData.get("smtpSecure") === "on",
    user: text(formData, "smtpUser") || null,
    password: typedPassword || existing?.smtpPassword || null,
    from,
  };
}

export async function saveMailSettings(_previous: MailFormState, formData: FormData): Promise<MailFormState> {
  await requireOwner();
  const settings = await settingsFromForm(formData);
  if (typeof settings === "string") return { error: settings };

  // Check the connection before saving, so a typo doesn't silently break every email.
  const check = await verifyMailSettings(settings);
  if (!check.ok) return { error: check.error };

  const data = {
    smtpHost: settings.host,
    smtpPort: settings.port,
    smtpSecure: settings.secure,
    smtpUser: settings.user,
    smtpPassword: settings.password,
    mailFrom: settings.from,
  };
  await prisma.instanceSetting.upsert({ where: { id: "instance" }, update: data, create: { id: "instance", ...data } });
  return { notice: "Connected and saved. Send a test email to check delivery." };
}

export async function clearMailSettings() {
  await requireOwner();
  await prisma.instanceSetting.upsert({
    where: { id: "instance" },
    update: { smtpHost: null, smtpPort: null, smtpSecure: false, smtpUser: null, smtpPassword: null, mailFrom: null },
    create: { id: "instance" },
  });
  back("Saved email settings removed. Environment settings (if any) are used now.");
}

export async function sendTestMail() {
  const owner = await requireOwner();
  const site = (await getSiteCreator())?.name ?? "Agora";
  const result = await sendMail(testEmail({ to: owner.email, siteName: site }));
  if (!result.ok) back(result.error, "error");
  back(`Test email sent to ${owner.email}.`);
}
