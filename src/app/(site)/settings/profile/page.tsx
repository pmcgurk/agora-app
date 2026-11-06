import type { ReactNode } from "react";
import ProfileForm from "@/components/ProfileForm";
import Avatar from "@/components/Avatar";
import Flash from "@/components/Flash";
import { buttonClass, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { creatorPath } from "@/lib/creator";
import { profileImageUrl } from "@/lib/profile-images";
import { readSocialLinks, SOCIAL_PLATFORMS } from "@/lib/social-links";

export const dynamic = "force-dynamic";

export default async function ProfileSettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { notice, error } = await searchParams;
  const isCreator = user.role === "CREATOR";
  const socialValues = Object.fromEntries(readSocialLinks(user.socialLinks).map(({ platform, url }) => [platform.key, url]));

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Profile</h2>
      <Flash notice={notice} error={error} />
      <div className="space-y-4">
        <ImageForm kind="avatar" label="Profile picture" hint="Square works best. PNG, JPEG or WebP up to 5 MB." hasImage={!!user.avatarKey} preview={<Avatar user={user} size={64} />} />
        {isCreator && (
          <ImageForm
            kind="banner"
            label="Banner"
            hint="Wide image shown at the top of your page. PNG, JPEG or WebP up to 5 MB."
            hasImage={!!user.bannerKey}
            preview={
              profileImageUrl(user, "banner") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileImageUrl(user, "banner")!} alt="" className="h-16 w-48 rounded-theme object-cover" />
              ) : null
            }
          />
        )}
      </div>
      <ProfileForm
        isCreator={isCreator}
        initial={{
          name: user.name,
          slug: user.slug ?? "",
          tagline: user.tagline ?? "",
          bio: user.bio ?? "",
          social: socialValues,
        }}
        platforms={SOCIAL_PLATFORMS.map((platform) => ({ key: platform.key, label: platform.label, usernameOnly: Boolean(platform.profileUrl) }))}
        pagePath={`/creators/${user.slug ?? "<page name>"}`}
      />
      {isCreator && (
        <p>
          <a href={creatorPath(user)} className={linkClass}>View your public page</a>
        </p>
      )}
    </section>
  );
}

function ImageForm({
  kind,
  label,
  hint,
  hasImage,
  preview,
}: {
  kind: "avatar" | "banner";
  label: string;
  hint: string;
  hasImage: boolean;
  preview: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-4">
        {preview}
        <form action="/api/profile-image" method="post" encType="multipart/form-data" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="kind" value={kind} />
          <input type="file" name="file" accept="image/png,image/jpeg,image/webp" required aria-label={label} />
          <button className={buttonClass}>Upload</button>
        </form>
        {hasImage && (
          <form action="/api/profile-image" method="post" encType="multipart/form-data">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="remove" value="1" />
            <button className="text-sm underline">Remove</button>
          </form>
        )}
      </div>
      <p className="text-sm text-muted">{hint}</p>
    </div>
  );
}
