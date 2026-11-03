"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

export const isAdminPath = (pathname: string) => /^\/(dashboard|settings|notifications|messages|login|signup)(\/|$)/.test(pathname);

// Switches the whole page (header included) to the dark palette on admin and sign-in routes.
export default function AdminScope({
  dark,
  darkStyle,
  children,
}: {
  dark: boolean;
  darkStyle: CSSProperties;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = dark && isAdminPath(pathname);
  return (
    <div data-theme-root data-admin-dark={active || undefined} style={active ? darkStyle : undefined} className="min-h-screen">
      {children}
    </div>
  );
}
