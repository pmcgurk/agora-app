import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/demo";

// The public demo is read-only: every action that would change something calls this first. It does
// nothing on a normal site. In the demo it sends the visitor back to the page they were on, with a
// short-lived cookie that makes the banner explain why nothing was saved.

export const DEMO_NOTICE_COOKIE = "agora_demo_notice";

export async function blockInDemo(): Promise<void> {
  if (!isDemoMode()) return;
  (await cookies()).set(DEMO_NOTICE_COOKIE, "1", { maxAge: 8, path: "/", httpOnly: true, sameSite: "lax" });
  let back = "/demo";
  try {
    const referer = (await headers()).get("referer");
    // Only the path is reused (never the query), and never one that could point to another site.
    const path = referer ? new URL(referer).pathname : "";
    if (path.startsWith("/") && !path.startsWith("//")) back = path;
  } catch {
    // An unusable Referer just means the visitor goes to the demo page.
  }
  redirect(back);
}
