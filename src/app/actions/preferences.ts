"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ADMIN_MODE_COOKIE } from "@/lib/admin-mode";

export async function setAdminMode(dark: boolean) {
  (await cookies()).set(ADMIN_MODE_COOKIE, dark ? "dark" : "light", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
