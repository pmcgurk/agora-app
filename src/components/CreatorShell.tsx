import Link from "next/link";
import type { ReactNode } from "react";
import Avatar from "@/components/Avatar";
import FontLink from "@/components/FontLink";
import PoweredBy from "@/components/PoweredBy";
import { SiteHeader } from "@/components/SiteHeader";
import ThemeCss from "@/components/ThemeCss";
import { tipsAvailable } from "@/components/TipJar";
import { linkClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { supportPath, type getCreator } from "@/lib/creator";
import { profileImageUrl } from "@/lib/profile-images";
import { readSocialLinks } from "@/lib/social-links";
import { loadProfileLayout, themeStyle } from "@/themes";

type Creator = NonNullable<Awaited<ReturnType<typeof getCreator>>>;

// The themed frame around a creator's pages. `homeHref` is "/" when the creator owns the whole site.
export default async function CreatorShell({
  creator,
  homeHref,
  children,
}: {
  creator: Creator;
  homeHref: string;
  children: ReactNode;
}) {
  const ProfileLayout = await loadProfileLayout(creator.themeName);
  const bannerUrl = profileImageUrl(creator, "banner");
  const socialLinks = readSocialLinks(creator.socialLinks);
  const showTip = (await tipsAvailable(creator)) && (await getCurrentUser())?.id !== creator.id;

  return (
    <div data-theme-root style={themeStyle(creator.themeName, creator.themeSettings, creator)} className="min-h-screen">
      <FontLink fonts={creator} settings={creator.themeSettings} />
      <ThemeCss settings={creator.themeSettings} />
      <SiteHeader />
      {bannerUrl && (
        <div className="mx-auto max-w-4xl px-4 pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bannerUrl} alt="" className="agora-banner aspect-[16/5] w-full rounded-theme object-cover" />
        </div>
      )}
      <ProfileLayout>
        <header>
          <div className="flex items-center gap-4">
            {creator.avatarKey && <Avatar user={creator} size={72} />}
            <div>
              <h1 className="agora-creator-name text-3xl font-bold text-primary">
                <Link href={homeHref}>{creator.name}</Link>
              </h1>
              {creator.tagline && <p className="mt-1 text-lg">{creator.tagline}</p>}
            </div>
          </div>
          {socialLinks.length > 0 && (
            <ul aria-label="Social accounts" className="agora-social mt-3 flex flex-wrap gap-2 text-sm">
              {socialLinks.map(({ platform, url }) => (
                <li key={platform.key}>
                  <a href={url} target="_blank" rel="noopener noreferrer me" className="inline-block rounded-full border border-line px-3 py-1 hover:border-primary hover:text-primary">
                    {platform.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <nav aria-label="Creator pages" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href={homeHref} className={linkClass}>Posts</Link>
            <Link href={await supportPath(creator)} className={linkClass}>Support</Link>
            {showTip && (
              <Link href={`${await supportPath(creator)}#tip`} className="agora-tip-link ml-auto rounded-full border border-line px-3 text-sm leading-6 hover:border-primary hover:text-primary">
                <span aria-hidden="true">♥</span> Tip
              </Link>
            )}
          </nav>
        </header>
        {children}
      </ProfileLayout>
      {creator.showPoweredBy && <PoweredBy />}
    </div>
  );
}
