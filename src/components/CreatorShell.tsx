import Link from "next/link";
import type { ReactNode } from "react";
import Avatar from "@/components/Avatar";
import FontLink from "@/components/FontLink";
import PoweredBy from "@/components/PoweredBy";
import { SiteHeader } from "@/components/SiteHeader";
import VerifyBanner from "@/components/VerifyBanner";
import ThemeCss from "@/components/ThemeCss";
import { tipsAvailable } from "@/components/TipJar";
import { subscribe } from "@/app/actions/patron";
import { buttonClass, secondaryButtonClass } from "@/components/ui";
import { activeSubscriptionWhere } from "@/lib/access";
import { paymentMode } from "@/lib/payments";
import { prisma } from "@/lib/prisma";
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
  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === creator.id;
  const showTip = (await tipsAvailable(creator)) && !isOwner;
  // "Support" only appears when there is something to support with: an open paid tier or tips.
  const hasPaidTiers =
    creator.acceptsPayments &&
    (await paymentMode()) !== "off" &&
    (await prisma.tier.count({ where: { creatorId: creator.id, price: { gt: 0 }, active: true } })) > 0;
  const supportHref = await supportPath(creator);
  const canSupport = hasPaidTiers || showTip;
  // Following is the free tier; hide the button once the viewer already has any plan.
  const followTier = isOwner ? null : await prisma.tier.findFirst({ where: { creatorId: creator.id, price: 0 }, select: { id: true } });
  const following =
    viewer && !isOwner
      ? (await prisma.subscription.count({ where: { patronId: viewer.id, tier: { creatorId: creator.id }, ...activeSubscriptionWhere() } })) > 0
      : false;
  const canFollow = followTier && !following && (viewer === null || viewer.role === "PATRON");

  return (
    <div data-theme-root style={themeStyle(creator.themeName, creator.themeSettings, creator)} className="min-h-screen">
      <FontLink fonts={creator} settings={creator.themeSettings} />
      <ThemeCss settings={creator.themeSettings} />
      <SiteHeader />
      <VerifyBanner />
      {bannerUrl && (
        <div className="mx-auto max-w-4xl px-4 pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bannerUrl} alt="" className="agora-banner aspect-16/5 w-full rounded-theme object-cover" />
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
          {!isOwner && (canFollow || canSupport) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {canFollow &&
                (viewer ? (
                  <form action={subscribe}>
                    <input type="hidden" name="tierId" value={followTier.id} />
                    <button className={canSupport ? secondaryButtonClass : buttonClass}>Follow</button>
                  </form>
                ) : (
                  <Link href="/signup" className={canSupport ? secondaryButtonClass : buttonClass}>Follow</Link>
                ))}
              {hasPaidTiers && <Link href={supportHref} className={buttonClass}>Support</Link>}
              {showTip && (
                <Link href={`${supportHref}#tip`} className="agora-tip-link rounded-full border border-line px-3 text-sm leading-8 hover:border-primary hover:text-primary">
                  <span aria-hidden="true">♥</span> Tip
                </Link>
              )}
            </div>
          )}
        </header>
        {children}
      </ProfileLayout>
      {creator.showPoweredBy && <PoweredBy />}
    </div>
  );
}
