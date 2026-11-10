import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import DemoBanner from "@/components/DemoBanner";
import FontLink from "@/components/FontLink";
import ThemeCss from "@/components/ThemeCss";
import { isDemoMode } from "@/lib/demo";
import { creatorIcons } from "@/lib/favicon";
import { getSiteCreator } from "@/lib/instance";
import { themeStyle } from "@/themes";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const creator = await getSiteCreator();

  return {
    title: creator?.name ?? "Agora",
    description: "A self-hosted platform for creators and their communities.",
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
        {children}
      </body>
    </html>
  );
}
