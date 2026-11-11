import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import AdminScope from "@/components/AdminScope";
import PoweredBy from "@/components/PoweredBy";
import PaymentBanner from "@/components/PaymentBanner";
import VerifyBanner from "@/components/VerifyBanner";
import { SiteHeader } from "@/components/SiteHeader";
import { isAdminDark } from "@/lib/admin-mode";
import { getSiteCreator, needsSetup } from "@/lib/instance";
import { adminDarkStyle } from "@/themes";

export default async function SiteLayout({ children }: { children: ReactNode }) {
  if (await needsSetup()) redirect("/setup");
  const [creator, dark] = await Promise.all([getSiteCreator(), isAdminDark()]);
  return (
    <AdminScope dark={dark} darkStyle={adminDarkStyle()}>
      <SiteHeader />
      <VerifyBanner />

      <PaymentBanner />
      {children}
      {(!creator || creator.showPoweredBy) && <PoweredBy />}
    </AdminScope>
  );
}
