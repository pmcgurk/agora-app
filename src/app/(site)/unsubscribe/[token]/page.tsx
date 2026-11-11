import { unsubscribe } from "@/app/actions/notifications";
import Flash from "@/components/Flash";
import { buttonClass, cardClass } from "@/components/ui";
import { findUnsubscribeTarget } from "@/lib/post-emails";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, referrer: "no-referrer" as const };

// Works without logging in. It shows a button instead of acting on a visit, because mail scanners open every link.
export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const [{ token }, { done }] = await Promise.all([params, searchParams]);
  const target = await findUnsubscribeTarget(token);

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className={`${cardClass} space-y-5 p-6 sm:p-8`}>
        <h1 className="font-heading text-2xl font-bold text-text">Email updates</h1>
        {!target ? (
          <p role="note" className="rounded-theme bg-secondary p-3 text-sm">This link isn&apos;t valid any more.</p>
        ) : done || !target.subscribed ? (
          <Flash notice="You won't get emails about new posts any more. You can turn them back on in Settings > Notifications." />
        ) : (
          <form action={unsubscribe} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <p className="text-sm text-muted">Stop emailing {target.name} when a creator they follow publishes a new post?</p>
            <button className={`${buttonClass} w-full text-center`}>Unsubscribe</button>
          </form>
        )}
      </div>
    </main>
  );
}
