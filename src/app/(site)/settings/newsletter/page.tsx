import { saveNewsletterSettings, sendTestEmail } from "@/app/actions/newsletter";
import EmailPreview from "@/components/EmailPreview";
import Flash from "@/components/Flash";
import { buttonClass, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { SYSTEM_EMAIL_KINDS } from "@/lib/email-samples";
import { getMailSettings } from "@/lib/mail";
import { buildPreview, parseChoice } from "@/lib/newsletter-preview";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewsletterSettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; kind?: string; postId?: string; format?: string }>;
}) {
  const user = await requireUser("CREATOR");
  const params = await searchParams;
  const choice = parseChoice(params);
  const posts = await prisma.post.findMany({
    where: { creatorId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, title: true },
  });
  const built = await buildPreview(user, choice);
  const mailReady = (await getMailSettings()) !== null;
  const selectedKind = choice.kind;
  const selectedPostId = choice.kind === "post" ? (choice.postId ?? posts[0]?.id ?? "") : (posts[0]?.id ?? "");
  const selectedFormat = choice.kind === "post" ? (choice.format ?? user.newsletterFormat) : user.newsletterFormat;

  const senderName = user.emailFromName ?? user.name;
  const from = "error" in built ? senderName : `${senderName} <${built.fromAddress ?? "your site’s sending address"}>`;
  const preview = "error" in built ? null : built;

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Newsletter</h2>
        <Flash notice={params.notice} error={params.error} />
        <p className="text-sm text-muted">
          Members who asked for emails get your new posts by email, in the colours and fonts of your blog. Turn emailing off for a single post
          in the post editor.
        </p>
        <form action={saveNewsletterSettings} className="space-y-4">
          <label className="block">
            What goes in the email
            <select name="newsletterFormat" defaultValue={user.newsletterFormat} className={inputClass}>
              <option value="EXCERPT">A short taste and a button to read it on the site</option>
              <option value="FULL">The whole post, as a newsletter</option>
            </select>
            <span className="mt-1 block text-sm text-muted">
              Only people who are allowed to read a post get it. Pictures are included for public posts; for members-only posts, and videos, the email links back to the site.
            </span>
          </label>
          <label className="block">
            Send as
            <input name="emailFromName" defaultValue={user.emailFromName ?? ""} maxLength={60} placeholder={user.name} className={inputClass} />
            <span className="mt-1 block text-sm text-muted">
              The name members see in their inbox. Your sign-up email address is never shown or used: emails go out from this site’s own
              sending address.
            </span>
          </label>
          <label className="block">
            Reply-to address (optional)
            <input name="emailReplyTo" type="email" defaultValue={user.emailReplyTo ?? ""} maxLength={254} placeholder="hello@example.com" className={inputClass} />
            <span className="mt-1 block text-sm text-muted">
              Where replies go. Leave it empty if you don’t want replies: they would go to the site’s sending address instead. Anything you enter
              here is visible to members who reply, so use an address you’re happy to share.
            </span>
          </label>
          <button className={buttonClass}>Save</button>
        </form>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Preview</h3>
        <form method="get" className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-3 lg:col-span-1">
            Email
            <select name="kind" defaultValue={selectedKind} className={inputClass}>
              <option value="post">A new post (newsletter)</option>
              {SYSTEM_EMAIL_KINDS.map((kind) => (
                <option key={kind.key} value={kind.key}>{kind.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            Post
            <select name="postId" defaultValue={selectedPostId} className={inputClass} disabled={posts.length === 0}>
              {posts.map((post) => (
                <option key={post.id} value={post.id}>{post.title}</option>
              ))}
            </select>
          </label>
          <label className="block">
            Shown as
            <select name="format" defaultValue={selectedFormat} className={inputClass}>
              <option value="EXCERPT">Short taste</option>
              <option value="FULL">Whole post</option>
            </select>
          </label>
          <div className="sm:col-span-3">
            <button className="rounded-theme border border-line px-4 py-2 hover:border-primary">Update preview</button>
          </div>
        </form>

        {"error" in built ? (
          <p role="note" className="rounded-theme bg-secondary p-3 text-sm">{built.error}</p>
        ) : (
          preview && (
            <>
              <EmailPreview
                subject={preview.message.subject}
                from={from}
                replyTo={choice.kind === "post" ? user.emailReplyTo : null}
                to="a follower"
                html={preview.message.html}
                text={preview.message.text}
              />
              <form action={sendTestEmail} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="kind" value={selectedKind} />
                <input type="hidden" name="postId" value={selectedPostId} />
                <input type="hidden" name="format" value={selectedFormat} />
                <button className={buttonClass} disabled={!mailReady}>Send me this as a test</button>
                <span className="text-sm text-muted">
                  {mailReady ? `It goes to ${user.email}, your account address.` : "Email isn’t set up on this site yet, so a test can’t be sent. The owner can set it up in Settings → Email."}
                </span>
              </form>
            </>
          )
        )}
      </div>
    </section>
  );
}
