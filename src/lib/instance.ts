import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// When the instance has exactly one creator, the whole site is that creator's page.
export const getSiteCreator = cache(async () => {
  const creators = await prisma.user.findMany({ where: { role: "CREATOR" }, take: 2 });
  return creators.length === 1 ? creators[0] : null;
});

// A fresh install has no creator yet and must run the setup wizard first.
export const needsSetup = cache(async (): Promise<boolean> => {
  return (await prisma.user.findFirst({ where: { role: "CREATOR" }, select: { id: true } })) === null;
});

export const isPrivateInstance = cache(async (): Promise<boolean> => {
  const row = await prisma.instanceSetting.findUnique({ where: { id: "instance" } });
  return row?.isPrivate ?? false;
});

export async function setInstancePrivate(isPrivate: boolean): Promise<void> {
  await prisma.instanceSetting.upsert({
    where: { id: "instance" },
    update: { isPrivate },
    create: { id: "instance", isPrivate },
  });
}

export const getInstanceSettings = cache(async () =>
  prisma.instanceSetting.findUnique({ where: { id: "instance" } }),
);

export type CreatorSignup = "INVITE" | "OPEN" | "APPROVAL";

// Whether this site hosts several creators, and how new creators may join.
export const getCreatorSettings = cache(async (): Promise<{ multiCreator: boolean; signup: CreatorSignup }> => {
  const settings = await getInstanceSettings();
  return { multiCreator: settings?.multiCreator ?? false, signup: settings?.creatorSignup ?? "INVITE" };
});

// The site's name for emails and page titles: the creator's name on a single-creator site.
export async function siteName(): Promise<string> {
  return (await getSiteCreator())?.name ?? "Agora";
}

export async function setMultiCreator(multiCreator: boolean): Promise<void> {
  await prisma.instanceSetting.upsert({
    where: { id: "instance" },
    update: { multiCreator },
    create: { id: "instance", multiCreator },
  });
}

// The owner is the creator who ran setup. Installs from before owners were recorded fall back to
// "the only creator", which is the same person in practice.
export async function isInstanceOwner(userId: string): Promise<boolean> {
  const settings = await getInstanceSettings();
  if (settings?.ownerId) return settings.ownerId === userId;
  const creators = await prisma.user.findMany({ where: { role: "CREATOR" }, select: { id: true }, take: 2 });
  return creators.length === 1 && creators[0].id === userId;
}

// Private instances only show content to signed-in users; login and signup stay open.
export async function requireInstanceAccess(): Promise<void> {
  if ((await isPrivateInstance()) && !(await getCurrentUser())) redirect("/login");
}
