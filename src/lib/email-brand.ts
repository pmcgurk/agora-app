import { emailThemeFor } from "@/lib/email-theme";
import type { Brand } from "@/lib/email-templates";
import { getSiteCreator, isPrivateInstance, siteName } from "@/lib/instance";
import { publicUrl } from "@/lib/urls";

type CreatorLook = {
  id: string;
  themeName: string;
  themeSettings: unknown;
  fontBody: string | null;
  fontHeading: string | null;
  avatarKey: string | null;
};

// A picture only works in an email when the reader can load it without logging in.
async function logoFor(creator: Pick<CreatorLook, "id" | "avatarKey"> | null): Promise<string | null> {
  if (!creator?.avatarKey || (await isPrivateInstance())) return null;
  return publicUrl(`/api/avatar/${creator.id}`);
}

// How the site's own emails look (sign-up links, receipts, resets): the site creator's blog theme and picture. On a
// site with several creators there is no single look, so the default is used.
export async function emailBrand(): Promise<Brand> {
  const creator = await getSiteCreator();
  return { siteName: await siteName(), theme: emailThemeFor(creator), logoUrl: await logoFor(creator) };
}

// How one creator's emails look, such as their newsletter: their own theme, name and picture.
export async function creatorBrand(creator: CreatorLook): Promise<Brand> {
  return { siteName: await siteName(), theme: emailThemeFor(creator), logoUrl: await logoFor(creator) };
}
