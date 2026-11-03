import Link from "next/link";
import type { ReactNode } from "react";
import Avatar from "@/components/Avatar";
import FontLink from "@/components/FontLink";
import PoweredBy from "@/components/PoweredBy";
import { SiteHeader } from "@/components/SiteHeader";
import ThemeCss from "@/components/ThemeCss";
import { linkClass } from "@/components/ui";
import { creatorPath, type getCreator } from "@/lib/creator";
import { profileImageUrl } from "@/lib/profile-images";
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

  return (
    <div data-theme-root style={themeStyle(creator.themeName, creator.themeSettings, creator)} className="min-h-screen">
      <FontLink fonts={creator} settings={creator.themeSettings} />
      <ThemeCss settings={creator.themeSettings} />
      <SiteHeader />
      <ProfileLayout>
        <header>
          {bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerUrl} alt="" className="agora-banner mb-4 aspect-[16/5] w-full rounded-theme object-cover" />
          )}
          <div className="flex items-center gap-4">
            {creator.avatarKey && <Avatar user={creator} size={72} />}
            <div>
              <h1 className="agora-creator-name text-3xl font-bold text-primary">
                <Link href={homeHref}>{creator.name}</Link>
              </h1>
              {creator.tagline && <p className="mt-1 text-lg">{creator.tagline}</p>}
              {creator.fediverseHandle && <p className="text-muted">{creator.fediverseHandle}</p>}
            </div>
          </div>
          <nav aria-label="Creator pages" className="mt-3 flex gap-4">
            <Link href={homeHref} className={linkClass}>Posts</Link>
            <Link href={`${creatorPath(creator)}/support`} className={linkClass}>Support</Link>
          </nav>
        </header>
        {children}
      </ProfileLayout>
      {creator.showPoweredBy && <PoweredBy />}
    </div>
  );
}
