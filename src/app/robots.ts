import type { MetadataRoute } from "next";
import { isDemoMode } from "@/lib/demo";
import { isPrivateInstance } from "@/lib/instance";
import { siteBaseUrl } from "@/lib/rss";

export const dynamic = "force-dynamic";

// Search engines may read the public pages, never the dashboard, sign-in or API. The media endpoint stays
// reachable so that link previews can fetch a post's picture. Private sites and the demo ask to be skipped.
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (isDemoMode() || (await isPrivateInstance())) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/settings",
        "/messages",
        "/notifications",
        "/login",
        "/signup",
        "/setup",
        "/onboarding",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
        "/apply",
        "/invite",
        "/demo",
        "/api/v1/",
        "/api/uploads",
        "/api/stripe/",
        "/api/health",
      ],
    },
    sitemap: `${siteBaseUrl()}/sitemap.xml`,
  };
}
