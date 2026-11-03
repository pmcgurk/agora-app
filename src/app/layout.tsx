import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import FontLink from "@/components/FontLink";
import ThemeCss from "@/components/ThemeCss";
import { getSiteCreator } from "@/lib/instance";
import { themeStyle } from "@/themes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agora",
  description: "A self-hosted platform for creators and their communities.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // On a single-creator instance the creator's theme styles every page, not just their profile.
  const creator = await getSiteCreator();
  return (
    <html lang="en">
      <body data-theme-root style={creator ? themeStyle(creator.themeName, creator.themeSettings, creator) : undefined}>
        {creator && <FontLink fonts={creator} settings={creator.themeSettings} />}
        {creator && <ThemeCss settings={creator.themeSettings} />}
        {children}
      </body>
    </html>
  );
}
