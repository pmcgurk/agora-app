import type { ReactNode } from "react";
import CreatorWorkspace from "@/components/CreatorWorkspace";
import SettingsNav from "@/components/SettingsNav";
import { requireUser } from "@/lib/auth";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  // Creators get the same sidebar as their dashboard; patrons keep a small settings page.
  if (user.role === "CREATOR") return <CreatorWorkspace userId={user.id}>{children}</CreatorWorkspace>;
  const sections = [
    { href: "/settings/profile", label: "Profile" },
    { href: "/settings/subscriptions", label: "Subscriptions" },
    { href: "/settings/notifications", label: "Notifications" },
    { href: "/settings/account", label: "Account" },
  ];
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold text-primary">Settings</h1>
      <div className="flex flex-col gap-6 sm:flex-row">
        <SettingsNav sections={sections} />
        <div className="min-w-0 flex-1 space-y-6">{children}</div>
      </div>
    </main>
  );
}
