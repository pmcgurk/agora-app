import type { ReactNode } from "react";
import CreatorNav, { type NavGroup } from "@/components/CreatorNav";
import { isInstanceOwner } from "@/lib/instance";

// The shared frame for a creator's dashboard and settings pages.
export default async function CreatorWorkspace({ userId, children }: { userId: string; children: ReactNode }) {
  const owner = await isInstanceOwner(userId);
  const groups: NavGroup[] = [
    {
      title: "Your page",
      links: [
        { href: "/dashboard", label: "Overview" },
        { href: "/dashboard/posts", label: "Posts" },
        { href: "/dashboard/members", label: "Members" },
        { href: "/dashboard/tiers", label: "Tiers" },
        { href: "/dashboard/analytics", label: "Analytics" },
      ],
    },
    {
      title: "Settings",
      links: [
        { href: "/settings/profile", label: "Profile" },
        { href: "/settings/appearance", label: "Appearance" },
        { href: "/settings/monetization", label: "Payments" },
        { href: "/settings/notifications", label: "Notifications" },
        { href: "/settings/privacy", label: "Privacy" },
        { href: "/settings/account", label: "Account" },
      ],
    },
    {
      title: "Advanced",
      collapsible: true,
      links: [
        ...(owner ? [{ href: "/settings/email", label: "Email" }] : []),
        { href: "/settings/api-keys", label: "API keys" },
        { href: "/settings/webhooks", label: "Webhooks" },
        { href: "/settings/api-docs", label: "API docs" },
      ],
    },
  ];
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-8 sm:flex-row">
        <CreatorNav groups={groups} />
        <div className="min-w-0 flex-1 space-y-6">{children}</div>
      </div>
    </main>
  );
}
