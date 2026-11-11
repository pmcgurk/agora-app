import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import "./globals.css";
import DemoBanner from "@/components/DemoBanner";
import FontLink from "@/components/FontLink";
import FormMemory from "@/components/FormMemory";
import ThemeCss from "@/components/ThemeCss";
import { isDemoMode } from "@/lib/demo";
import { markdownExcerpt } from "@/lib/excerpt";
import { creatorIcons } from "@/lib/favicon";
import { getSiteCreator } from "@/lib/instance";
import { versionLabel } from "@/lib/version";
import { themeStyle } from "@/themes";

export const dynamic = "force-dynamic";

function baseUrl(): URL | undefined {
  try {
    return new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "");
  } catch {
    return undefined;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const creator = await getSiteCreator();

  return {
    // Relative addresses in link previews (pictures, canonical links) become absolute from this one.
    metadataBase: baseUrl(),
    generator: `Agora ${versionLabel()}`,
    title: creator?.name ?? "Agora",
    description: creator ? creator.tagline || markdownExcerpt(creator.bio ?? "", 160) || undefined : "A self-hosted platform for creators and their communities.",
    // Lets feed readers and browsers find the feed from any page.
    ...(creator ? { alternates: { types: { "application/rss+xml": "/feed.xml" } } } : {}),
    ...(creator ? { openGraph: { siteName: creator.name, type: "website" as const } } : {}),
    // On a single-creator site the tab icon is the creator's own picture.
    ...(creator ? { icons: creatorIcons(creator, { single: true }) } : {}),
    // A public demo is not a site worth finding in search results.
    ...(isDemoMode() ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // On a single-creator instance the creator's theme styles every page, not just their profile.
  const creator = await getSiteCreator();

  return (
    <html lang="en">
      <body data-theme-root style={creator ? themeStyle(creator.themeName, creator.themeSettings, creator) : undefined}>
        {creator && <FontLink fonts={creator} settings={creator.themeSettings} />}
        {creator && <ThemeCss settings={creator.themeSettings} />}
        <DemoBanner />
        {/* Keeps what was typed in a form when the server sends you back to it with an error. */}
        <Suspense fallback={null}>
          <FormMemory />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
