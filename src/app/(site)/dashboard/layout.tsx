import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import SettingsNav from "@/components/SettingsNav";
import { requireUser } from "@/lib/auth";

const CREATOR_SECTIONS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/posts", label: "Posts" },
  { href: "/dashboard/members", label: "Members" },
  { href: "/dashboard/tiers", label: "Tiers" },
  { href: "/dashboard/analytics", label: "Analytics" },
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (user.role !== "CREATOR") return <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">{children}</main>;
  if (!user.onboardedAt) redirect("/onboarding");
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-8 sm:flex-row">
        <SettingsNav sections={CREATOR_SECTIONS} label="Dashboard" />
        <div className="min-w-0 flex-1 space-y-6">{children}</div>
      </div>
    </main>
  );
}
