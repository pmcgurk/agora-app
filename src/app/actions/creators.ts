"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, requireUser } from "@/lib/auth";
import { DEMO_OFF, isDemoMode } from "@/lib/demo";
import { applicationApprovedEmail, applicationReceivedEmail, applicationRejectedEmail, invitationEmail } from "@/lib/email-templates";
import { createCreatorInvite, findOpenInvite, INVITE_COOKIE } from "@/lib/invites";
import { emailBrand } from "@/lib/email-brand";
import { getCreatorSettings, getInstanceSettings, isInstanceOwner, setMultiCreator, type CreatorSignup } from "@/lib/instance";
import { sendMail } from "@/lib/mail";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { SLUG_PATTERN } from "@/lib/profile-fields";
import { clientIp, withinLimit } from "@/lib/rate-limit";
import { publicUrl } from "@/lib/urls";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;
const CREATORS = "/settings/creators";
const SIGNUP_MODES: CreatorSignup[] = ["INVITE", "OPEN", "APPROVAL"];

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Paths may already carry a query (e.g. "/signup?as=creator"), so append with the right separator.
const withQuery = (path: string, query: string) => `${path}${path.includes("?") ? "&" : "?"}${query}`;

function fail(path: string, message: string): never {
  redirect(withQuery(path, `error=${encodeURIComponent(message)}`));
}

function done(path: string, message: string): never {
  redirect(withQuery(path, `notice=${encodeURIComponent(message)}`));
}

// Only the owner manages other creators.
async function requireOwner() {
  if (isDemoMode()) fail(CREATORS, DEMO_OFF);
  const user = await requireUser("CREATOR");
  if (!(await isInstanceOwner(user.id))) redirect("/dashboard");
  return user;
}

// The owner's account, for emails about applications.
async function ownerAccount() {
  const settings = await getInstanceSettings();
  if (settings?.ownerId) return prisma.user.findUnique({ where: { id: settings.ownerId } });
  return prisma.user.findFirst({ where: { role: "CREATOR" }, orderBy: { id: "asc" } });
}

// A page name is taken if a creator uses it or an open invite or application reserves it.
async function pageNameTaken(slug: string, exceptUserId?: string): Promise<boolean> {
  const [user, invite, application] = await Promise.all([
    prisma.user.findFirst({ where: { slug, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) }, select: { id: true } }),
    prisma.creatorInvite.findFirst({ where: { slug, acceptedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } }),
    prisma.creatorApplication.findFirst({ where: { slug, status: "PENDING" }, select: { id: true } }),
  ]);
  return Boolean(user || invite || application);
}

// Shared checks for anyone asking for a creator account (sign-up and applications).
async function validateNewCreator(formData: FormData, path: string) {
  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const slug = text(formData, "slug").toLowerCase();
  if (!name || name.length > 100) fail(path, "Enter a name up to 100 characters.");
  if (!EMAIL_PATTERN.test(email) || email.length > 254) fail(path, "Enter a valid email address.");
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) fail(path, `Password must be ${MIN_PASSWORD_LENGTH}-200 characters.`);
  if (!SLUG_PATTERN.test(slug)) fail(path, "The page name must be 3-30 characters: lowercase letters, numbers and hyphens.");
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) fail(path, "That email already has an account. Log in instead.");
  if (await pageNameTaken(slug)) fail(path, "That page name is already taken.");
  return { name, email, password, slug };
}

export async function setMultiCreatorMode(formData: FormData) {
  await requireOwner();
  const on = formData.get("multiCreator") === "on";
  await setMultiCreator(on);
  done(CREATORS, on ? "Several creators are now allowed." : "Only your page is open on this site.");
}

export async function setCreatorSignupMode(formData: FormData) {
  await requireOwner();
  const mode = text(formData, "signup") as CreatorSignup;
  if (!SIGNUP_MODES.includes(mode)) fail(CREATORS, "Choose one of the sign-up options.");
  await prisma.instanceSetting.upsert({
    where: { id: "instance" },
    update: { creatorSignup: mode },
    create: { id: "instance", creatorSignup: mode },
  });
  done(CREATORS, "Sign-up option saved.");
}

export async function inviteCreator(formData: FormData) {
  const owner = await requireOwner();
  if (!(await getCreatorSettings()).multiCreator) fail(CREATORS, "Turn on several creators first.");

  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const slugInput = text(formData, "slug").toLowerCase();
  if (!name || name.length > 100) fail(CREATORS, "Enter a name up to 100 characters.");
  if (!EMAIL_PATTERN.test(email) || email.length > 254) fail(CREATORS, "Enter a valid email address.");
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    fail(CREATORS, "That email already has an account.");
  }
  if (slugInput && !SLUG_PATTERN.test(slugInput)) {
    fail(CREATORS, "The page name must be 3-30 characters: lowercase letters, numbers and hyphens.");
  }
  if (slugInput && (await pageNameTaken(slugInput))) fail(CREATORS, "That page name is already taken.");

  const token = await createCreatorInvite({ createdById: owner.id, email, name, slug: slugInput || null });
  const brand = await emailBrand();
  const sent = await sendMail(
    invitationEmail({ to: email, ...brand, inviteeName: name, inviterName: owner.name, url: publicUrl(`/invite/${token}`) }),
  );
  // The raw link is shown once, on the creators page, from a short-lived cookie.
  (await cookies()).set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NEXT_PUBLIC_BASE_URL?.startsWith("https://") ?? false,
    path: CREATORS,
    maxAge: 600,
  });
  done(
    CREATORS,
    sent.ok
      ? `Invite emailed to ${email}. The link is also below if you want to send it yourself.`
      : "Invite created. Email isn't working, so copy the link below and send it yourself.",
  );
}

export async function revokeInvite(formData: FormData) {
  const owner = await requireOwner();
  await prisma.creatorInvite.deleteMany({
    where: { id: text(formData, "inviteId"), createdById: owner.id, acceptedAt: null },
  });
  done(CREATORS, "Invite revoked.");
}

export async function setCreatorPage(formData: FormData) {
  await requireOwner();
  const userId = text(formData, "userId");
  const slug = text(formData, "slug").toLowerCase();
  const creator = await prisma.user.findFirst({ where: { id: userId, role: "CREATOR" }, select: { id: true } });
  if (!creator) fail(CREATORS, "That creator no longer exists.");
  if (slug && !SLUG_PATTERN.test(slug)) {
    fail(CREATORS, "The page name must be 3-30 characters: lowercase letters, numbers and hyphens.");
  }
  if (slug && (await pageNameTaken(slug, creator.id))) fail(CREATORS, "That page name is already taken.");
  await prisma.user.update({ where: { id: creator.id }, data: { slug: slug || null } });
  done(CREATORS, "Page name saved.");
}

// Open sign-up: anyone can create a creator account, with their own page name.
export async function signupCreator(formData: FormData) {
  const path = "/signup?as=creator";
  if (isDemoMode()) fail(path, DEMO_OFF);
  const settings = await getCreatorSettings();
  if (!settings.multiCreator || settings.signup !== "OPEN") fail("/signup", "Creator sign-up is closed on this site.");
  if (!withinLimit(`creator-signup:${await clientIp()}`, 10, 60 * 60 * 1000)) fail(path, "Too many attempts. Try again later.");

  const { name, email, password, slug } = await validateNewCreator(formData, path);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: "CREATOR",
      emailVerifiedAt: new Date(),
      slug,
      passwordHash: await hashPassword(password),
      createdTiers: { create: { name: "Follower", price: 0 } },
    },
  });
  await createSession(user.id);
  redirect("/onboarding");
}

// Approval: anyone can apply; nothing is created until the owner approves.
export async function applyForCreator(formData: FormData) {
  const path = "/apply";
  if (isDemoMode()) fail(path, DEMO_OFF);
  const settings = await getCreatorSettings();
  if (!settings.multiCreator || settings.signup !== "APPROVAL") fail("/signup", "Applications are closed on this site.");
  if (!withinLimit(`apply:${await clientIp()}`, 5, 60 * 60 * 1000)) fail(path, "Too many applications from this network. Try again later.");

  const { name, email, password, slug } = await validateNewCreator(formData, path);
  const about = text(formData, "about");
  if (about.length > 1000) fail(path, "Keep the description under 1000 characters.");
  if (await prisma.creatorApplication.findFirst({ where: { email, status: "PENDING" }, select: { id: true } })) {
    fail(path, "You already have an application waiting for review.");
  }

  await prisma.creatorApplication.create({
    data: { name, email, slug, about: about || null, passwordHash: await hashPassword(password) },
  });
  const owner = await ownerAccount();
  if (owner) {
    await sendMail(
      applicationReceivedEmail({
        to: owner.email,
        ...(await emailBrand()),
        applicantName: name,
        applicantEmail: email,
        url: publicUrl(CREATORS),
      }),
    );
  }
  redirect("/apply?sent=1");
}

export async function decideApplication(formData: FormData) {
  await requireOwner();
  const id = text(formData, "applicationId");
  const decision = text(formData, "decision");
  const application = await prisma.creatorApplication.findUnique({ where: { id } });
  if (!application || application.status !== "PENDING") fail(CREATORS, "That application has already been decided.");
  const brand = await emailBrand();

  if (decision === "reject") {
    await prisma.creatorApplication.update({ where: { id }, data: { status: "REJECTED", decidedAt: new Date() } });
    await sendMail(applicationRejectedEmail({ to: application.email, ...brand, name: application.name }));
    done(CREATORS, `Application from ${application.name} rejected.`);
  }

  if (decision !== "approve") fail(CREATORS, "Choose approve or reject.");
  if (await prisma.user.findUnique({ where: { email: application.email }, select: { id: true } })) {
    fail(CREATORS, "That email now has an account, so this application can't be approved.");
  }
  if (application.slug && (await prisma.user.findFirst({ where: { slug: application.slug }, select: { id: true } }))) {
    fail(CREATORS, "That page name is taken now. Reject the application or ask them to apply again.");
  }

  await prisma.$transaction([
    prisma.user.create({
      data: {
        name: application.name,
        email: application.email,
        role: "CREATOR",
        emailVerifiedAt: new Date(),
        slug: application.slug,
        passwordHash: application.passwordHash,
        createdTiers: { create: { name: "Follower", price: 0 } },
      },
    }),
    prisma.creatorApplication.update({ where: { id }, data: { status: "APPROVED", decidedAt: new Date() } }),
  ]);
  await sendMail(applicationApprovedEmail({ to: application.email, ...brand, name: application.name, url: publicUrl("/login") }));
  done(CREATORS, `${application.name} is now a creator.`);
}

export async function acceptInvite(formData: FormData) {
  const token = text(formData, "token");
  const path = `/invite/${encodeURIComponent(token)}`;
  if (isDemoMode()) fail(path, DEMO_OFF);
  if (!withinLimit(`invite:${await clientIp()}`, 10, 60 * 60 * 1000)) fail(path, "Too many attempts. Try again later.");

  const invite = await findOpenInvite(token);
  if (!invite) redirect("/login?error=" + encodeURIComponent("That invite has expired or was already used."));

  const name = text(formData, "name") || invite.name;
  const password = String(formData.get("password") ?? "");
  if (!name || name.length > 100) fail(path, "Enter a name up to 100 characters.");
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
    fail(path, `Password must be ${MIN_PASSWORD_LENGTH}-200 characters.`);
  }
  if (await prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } })) {
    fail(path, "That email already has an account. Log in instead.");
  }
  // Only existing creators can hold the name; this invite is the one reserving it.
  if (invite.slug && (await prisma.user.findFirst({ where: { slug: invite.slug }, select: { id: true } }))) {
    fail(path, "That page name was taken after the invite was sent. Ask for a new invite.");
  }

  const user = await prisma.user.create({
    data: {
      name,
      email: invite.email,
      role: "CREATOR",
      emailVerifiedAt: new Date(),
      slug: invite.slug,
      passwordHash: await hashPassword(password),
      createdTiers: { create: { name: "Follower", price: 0 } },
    },
  });
  await prisma.creatorInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  await createSession(user.id);
  redirect("/onboarding");
}
