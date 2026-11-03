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

// Private instances only show content to signed-in users; login and signup stay open.
export async function requireInstanceAccess(): Promise<void> {
  if ((await isPrivateInstance()) && !(await getCurrentUser())) redirect("/login");
}
