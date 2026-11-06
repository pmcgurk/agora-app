import { saveFeedPaging } from "@/app/actions/settings";
import Flash from "@/components/Flash";
import { buttonClass, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { FEED_PAGE_SIZES, pageSizeOf } from "@/lib/feed";

export const dynamic = "force-dynamic";

export default async function FeedSettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser("CREATOR");
  const { notice, error } = await searchParams;
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Feed</h2>
      <Flash notice={notice} error={error} />
      <form action={saveFeedPaging} className="space-y-3">
        <label className="block">
          How visitors load more posts
          <select name="feedPaging" defaultValue={user.feedPaging} className={inputClass}>
            <option value="scroll">Infinite scrolling (loads more as you scroll)</option>
            <option value="pages">Pages (Newer / Older links)</option>
          </select>
        </label>
        <label className="block">
          Posts at a time
          <select name="feedPageSize" defaultValue={pageSizeOf(user)} className={inputClass}>
            {FEED_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size} posts</option>
            ))}
          </select>
        </label>
        <p className="text-sm text-muted">Applies to each scroll batch or page. Search works in both modes.</p>
        <button className={buttonClass}>Save</button>
      </form>
    </section>
  );
}
