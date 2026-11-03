"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SettingsNav({
  sections,
  label = "Settings",
}: {
  sections: { href: string; label: string }[];
  label?: string;
}) {
  const pathname = usePathname();
  // "/dashboard" is only active on itself; deeper sections match by prefix.
  const active = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  return (
    <nav aria-label={label} className="agora-sidebar flex gap-1 overflow-x-auto sm:w-44 sm:flex-none sm:flex-col">
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          aria-current={active(section.href) ? "page" : undefined}
          className={`whitespace-nowrap rounded-theme px-3 py-2 ${active(section.href) ? "bg-primary text-on-primary" : "hover:bg-secondary"}`}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
