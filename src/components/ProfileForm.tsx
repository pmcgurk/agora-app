"use client";

import { useActionState, useState } from "react";
import { saveProfile, type ProfileFormState } from "@/app/actions/settings";
import { buttonClass, inputClass } from "@/components/ui";

type Platform = { key: string; label: string; usernameOnly: boolean };

export type ProfileValues = {
  name: string;
  slug: string;
  tagline: string;
  bio: string;
  social: Record<string, string>;
};

// Every field is controlled, so after a validation error the page shows exactly what was typed.
export default function ProfileForm({
  isCreator,
  initial,
  platforms,
  pagePath,
}: {
  isCreator: boolean;
  initial: ProfileValues;
  platforms: Platform[];
  pagePath: string;
}) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(saveProfile, {});
  const [values, setValues] = useState(initial);
  const set = (key: keyof Omit<ProfileValues, "social">) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const setSocial = (key: string, value: string) =>
    setValues((current) => ({ ...current, social: { ...current.social, [key]: value } }));

  return (
    <form action={action} className="space-y-4">
      {state.error && <p role="alert" className="rounded-theme bg-danger/10 p-3 text-sm text-danger">{state.error}</p>}
      {state.notice && <p role="status" className="rounded-theme bg-secondary p-3 text-sm text-success">{state.notice}</p>}

      <label className="block">
        Display name
        <input name="name" required maxLength={100} value={values.name} onChange={set("name")} className={inputClass} />
      </label>
      {isCreator && (
        <>
          <label className="block">
            Page name
            <input
              name="slug"
              maxLength={30}
              value={values.slug}
              onChange={set("slug")}
              placeholder="my-page"
              className={inputClass}
            />
            <span className="block text-sm text-muted">
              Your page lives at {pagePath}. Lowercase letters, numbers and hyphens.
            </span>
          </label>
          <label className="block">
            Tagline
            <input name="tagline" maxLength={120} value={values.tagline} onChange={set("tagline")} className={inputClass} />
          </label>
          <label className="block">
            About
            <textarea name="bio" rows={5} maxLength={2000} value={values.bio} onChange={set("bio")} className={inputClass} />
          </label>
          <fieldset className="space-y-2">
            <legend className="font-medium">Social accounts</legend>
            <p className="text-sm text-muted">Paste a link or just your username. Leave blank to hide.</p>
            {platforms.map((platform) => (
              <label key={platform.key} className="block">
                {platform.label}
                <input
                  name={`social-${platform.key}`}
                  maxLength={300}
                  value={values.social[platform.key] ?? ""}
                  onChange={(event) => setSocial(platform.key, event.target.value)}
                  placeholder={platform.usernameOnly ? "username or link" : "https://…"}
                  className={inputClass}
                />
              </label>
            ))}
          </fieldset>
        </>
      )}
      <button className={buttonClass} disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
