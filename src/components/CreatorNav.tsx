"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavLink = { href: string; label: string };
export type NavGroup = { title: string; links: NavLink[]; collapsible?: boolean };

// One sidebar for everything a creator manages: their content, their people, and the settings.
// Rarely used technical pages sit in a collapsed "Advanced" group that opens when you are inside it.
export default function CreatorNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  const list = (links: NavLink[]) =>
    links.map((link) => (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active(link.href) ? "page" : undefined}
        className={`whitespace-nowrap rounded-theme px-3 py-2 ${active(link.href) ? "bg-primary text-on-primary" : "hover:bg-secondary"}`}
      >
        {link.label}
      </Link>
    ));

  return (
    <nav aria-label="Creator" className="agora-sidebar space-y-4 sm:w-44 sm:flex-none">
      {groups.map((group) =>
        group.collapsible ? (
          <details key={group.title} open={group.links.some((link) => active(link.href))} className="group">
            <summary className="cursor-pointer px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted marker:content-none">
              {group.title} <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">›</span>
            </summary>
            <div className="mt-1 flex flex-wrap gap-1 sm:flex-col">{list(group.links)}</div>
          </details>
        ) : (
          <div key={group.title}>
            <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">{group.title}</p>
            <div className="flex flex-wrap gap-1 sm:flex-col">{list(group.links)}</div>
          </div>
        ),
      )}
    </nav>
  );
}
