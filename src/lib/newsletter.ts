import { postPath } from "@/lib/creator";
import { creatorBrand } from "@/lib/email-brand";
import { newPostEmail } from "@/lib/email-templates";
import { markdownExcerpt } from "@/lib/excerpt";
import { isPrivateInstance } from "@/lib/instance";
import type { MailMessage } from "@/lib/mail";
import { emailImageResolver, renderEmailMarkdown } from "@/lib/markdown-email";
import { publicUrl } from "@/lib/urls";

// Builds the email for one post, exactly as a follower receives it. The sender uses this for real, and the preview
// and "send me a test" tools use it too, so what a creator checks is what their members get.

export type NewsletterCreator = {
  id: string;
  name: string;
  slug: string | null;
  themeName: string;
  themeSettings: unknown;
  fontBody: string | null;
  fontHeading: string | null;
  avatarKey: string | null;
  newsletterFormat: "EXCERPT" | "FULL";
  emailFromName: string | null;
  emailReplyTo: string | null;
};

export type NewsletterPost = {
  id: string;
  slug: string | null;
  title: string;
  textContent: string;
  publishedAt: Date | null;
  isPublic: boolean;
  creator: NewsletterCreator;
};

const dateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export const EXCERPT_LENGTH = 280;

export async function composePostEmail(
  post: NewsletterPost,
  recipient: { email: string; unsubscribeToken: string },
  // Overrides the creator's saved choice, for previews of the other format.
  format: "EXCERPT" | "FULL" = post.creator.newsletterFormat ?? "EXCERPT",
): Promise<MailMessage> {
  const creator = post.creator;
  const brand = await creatorBrand(creator);
  const postUrl = publicUrl(await postPath(creator, post));
  const theme = brand.theme!;
  const body =
    format === "FULL"
      ? renderEmailMarkdown(post.textContent, {
          theme,
          postUrl,
          resolveImage: emailImageResolver(post, await isPrivateInstance()),
        })
      : null;

  const message = newPostEmail({
    ...brand,
    to: recipient.email,
    creatorName: creator.name,
    title: post.title,
    excerpt: markdownExcerpt(post.textContent, EXCERPT_LENGTH),
    postUrl,
    unsubscribeUrl: publicUrl(`/unsubscribe/${recipient.unsubscribeToken}`),
    oneClickUnsubscribeUrl: publicUrl(`/api/unsubscribe/${recipient.unsubscribeToken}`),
    body,
    publishedOn: post.publishedAt ? dateFormat.format(post.publishedAt) : undefined,
    replyNote: creator.emailReplyTo ? `You can reply to this email to write to ${creator.name}.` : null,
  });
  // "Send as": the name members see is the creator's choice (their public name by default), never their account
  // email. The address is the site's, and replies go only to the address the creator picked, if they picked one.
  return { ...message, fromName: creator.emailFromName ?? creator.name, replyTo: creator.emailReplyTo ?? undefined };
}
