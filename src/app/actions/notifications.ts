"use server";

import { blockInDemo } from "@/lib/demo-guard";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function clearNotifications() {
  await blockInDemo();
  const user = await requireUser();
  await prisma.notification.deleteMany({ where: { userId: user.id } });
  revalidatePath("/notifications");
}
