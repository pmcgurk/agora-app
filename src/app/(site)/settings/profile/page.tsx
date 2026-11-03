import type { ReactNode } from "react";
import { saveProfile } from "@/app/actions/settings";
import Avatar from "@/components/Avatar";
import Flash from "@/components/Flash";
import { buttonClass, inputClass, linkClass } from "@/components/ui";
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
      <form action={saveProfile} className="space-y-4">
        <label className="block">
          Display name
          <input name="name" required maxLength={100} defaultValue={user.name} className={inputClass} />
        </label>
        {isCreator && (
          <>
            <label className="block">
              Page name
              <input
                name="slug"
                maxLength={30}
                defaultValue={user.slug ?? ""}
                placeholder="my-page"
                className={inputClass}
              />
              <span className="block text-sm text-muted">
                Your page lives at /creators/{user.slug ?? "<page name>"}. Lowercase letters, numbers and hyphens.
              </span>
            </label>
            <label className="block">
              Tagline
              <input name="tagline" maxLength={120} defaultValue={user.tagline ?? ""} className={inputClass} />
            </label>
            <label className="block">
              About
              <textarea name="bio" rows={5} maxLength={2000} defaultValue={user.bio ?? ""} className={inputClass} />
            </label>
            <label className="block">
              Fediverse handle
              <input
                name="fediverseHandle"
                defaultValue={user.fediverseHandle ?? ""}
                placeholder="@you@example.social"
                className={inputClass}
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="font-medium">Social accounts</legend>
              <p className="text-sm text-muted">Paste a link or just your username. Leave blank to hide.</p>
              {SOCIAL_PLATFORMS.map((platform) => (
                <label key={platform.key} className="block">
                  {platform.label}
                  <input
                    name={`social-${platform.key}`}
                    maxLength={300}
                    defaultValue={socialValues[platform.key] ?? ""}
                    placeholder={platform.profileUrl ? "username or link" : "https://…"}
                    className={inputClass}
                  />
                </label>
              ))}
            </fieldset>
          </>
        )}
        <button className={buttonClass}>Save profile</button>
      </form>
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
