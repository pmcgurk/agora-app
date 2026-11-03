import Link from "next/link";
import { redirect } from "next/navigation";
import AdminScope from "@/components/AdminScope";
import CreatorFeed from "@/components/CreatorFeed";
import CreatorShell from "@/components/CreatorShell";
import Logo from "@/components/Logo";
import PoweredBy from "@/components/PoweredBy";
import { SiteHeader } from "@/components/SiteHeader";
import { isAdminDark } from "@/lib/admin-mode";
import { creatorPath } from "@/lib/creator";
import { getSiteCreator, needsSetup, requireInstanceAccess } from "@/lib/instance";
import { adminDarkStyle } from "@/themes";
import { prisma } from "@/lib/prisma";
import { linkClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  if (await needsSetup()) redirect("/setup");
  await requireInstanceAccess();
  const siteCreator = await getSiteCreator();
  // With a single creator the root is their feed.
  if (siteCreator) {
    const { error, notice } = await searchParams;
    return (
      <CreatorShell creator={siteCreator} homeHref="/">
        <CreatorFeed creator={siteCreator} notice={notice} error={error} />
      </CreatorShell>
    );
  }
  const dark = await isAdminDark();

  const creators = await prisma.user.findMany({
    where: { role: "CREATOR" },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, tagline: true },
    take: 50,
  });

  return (
    <AdminScope dark={dark} darkStyle={adminDarkStyle()}>
    <SiteHeader />
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-16">
      <header className="text-center">
        <h1><Logo className="text-6xl" /></h1>
        <p className="mt-4 text-lg">
          Self-hosted, open-source support for creators and their communities.
        </p>
      </header>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Creators</h2>
        <ul className="space-y-1">
          {creators.map((creator) => (
            <li key={creator.id}>
              <Link href={creatorPath(creator)} className={linkClass}>{creator.name}</Link>
              {creator.tagline && <span className="ml-2 text-muted">{creator.tagline}</span>}
            </li>
          ))}
          {creators.length === 0 && <li className="text-muted">No creators yet.</li>}
        </ul>
      </section>
    </main>
    <PoweredBy />
    </AdminScope>
  );
}
