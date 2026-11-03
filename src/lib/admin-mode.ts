import { cookies } from "next/headers";

export const ADMIN_MODE_COOKIE = "agora-admin-mode";

// Dark mode for the signed-in and sign-in screens; visitors always see the creator's theme.
export async function isAdminDark(): Promise<boolean> {
  return (await cookies()).get(ADMIN_MODE_COOKIE)?.value === "dark";
}
