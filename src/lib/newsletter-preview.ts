import { emailBrand } from "@/lib/email-brand";
import { isSystemEmailKind, sampleEmail, type SystemEmailKind } from "@/lib/email-samples";
import { getMailSettings, type MailMessage } from "@/lib/mail";
import { composePostEmail, type NewsletterCreator } from "@/lib/newsletter";
import { prisma } from "@/lib/prisma";

// What the preview page and the "send me a test" button show: either one of the creator's real posts as a newsletter,
// or an example of one of the site's other emails. Both are built by the same code that builds the real emails.

export type PreviewChoice =
  | { kind: "post"; postId: string | null; format: "EXCERPT" | "FULL" | null }
  | { kind: SystemEmailKind };

export function parseChoice(params: { kind?: string; postId?: string; format?: string }): PreviewChoice {
  if (isSystemEmailKind(params.kind)) return { kind: params.kind };
  return { kind: "post", postId: params.postId?.trim() || null, format: params.format === "FULL" || params.format === "EXCERPT" ? params.format : null };
}

export type BuiltPreview = {
  message: MailMessage;
  // The post that was used, so the page can say which one.
  postTitle: string | null;
  // What a real send would use: the site's address with the creator's chosen name.
  fromAddress: string | null;
};

const SAMPLE_TOKEN = "0".repeat(64);

// The address part of the site's From, for showing "Name <address>".
export async function siteFromAddress(): Promise<string | null> {
  const settings = await getMailSettings();
  if (!settings) return null;
  const bracketed = /<([^<>]+)>\s*$/.exec(settings.from);
  return (bracketed ? bracketed[1] : settings.from).trim();
}

export async function buildPreview(
  creator: NewsletterCreator & { email: string; unsubscribeToken: string },
  choice: PreviewChoice,
  // A test email goes to the creator, with their own unsubscribe link; a preview uses a harmless made-up one.
  forTest = false,
): Promise<BuiltPreview | { error: string }> {
  const fromAddress = await siteFromAddress();
  const to = forTest ? creator.email : "a-follower@example.com";

  if (choice.kind !== "post") {
    const message = sampleEmail(choice.kind, await emailBrand(), to);
    return { message, postTitle: null, fromAddress };
  }

  const post = await prisma.post.findFirst({
    where: choice.postId ? { id: choice.postId, creatorId: creator.id } : { creatorId: creator.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true, title: true, textContent: true, publishedAt: true, isPublic: true },
  });
  if (!post) return { error: choice.postId ? "That post could not be found." : "Write a post first, then you can see how it looks as an email." };

  const message = await composePostEmail(
    { ...post, creator },
    { email: to, unsubscribeToken: forTest ? creator.unsubscribeToken : SAMPLE_TOKEN },
    choice.format ?? creator.newsletterFormat,
  );
  return { message, postTitle: post.title, fromAddress };
}
