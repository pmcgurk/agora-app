"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function clearNotifications() {
  const user = await requireUser();
  await prisma.notification.deleteMany({ where: { userId: user.id } });
  revalidatePath("/notifications");
}
