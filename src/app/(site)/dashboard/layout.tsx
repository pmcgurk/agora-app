import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import CreatorWorkspace from "@/components/CreatorWorkspace";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (user.role !== "CREATOR") return <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">{children}</main>;
  if (!user.onboardedAt) redirect("/onboarding");
  return <CreatorWorkspace userId={user.id}>{children}</CreatorWorkspace>;
}
