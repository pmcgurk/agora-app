import { saveNotifications } from "@/app/actions/settings";
import Flash from "@/components/Flash";
import { buttonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NotificationSettings({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { notice, error } = await searchParams;
  const isCreator = user.role === "CREATOR";
  const [tiers, muted] = isCreator
    ? await Promise.all([
        prisma.tier.findMany({ where: { creatorId: user.id }, orderBy: { price: "asc" } }),
        prisma.tierMute.findMany({ where: { userId: user.id }, select: { tierId: true } }),
      ])
    : [[], []];
  const mutedIds = new Set(muted.map((mute) => mute.tierId));

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Notifications</h2>
      <Flash notice={notice} error={error} />
      <form action={saveNotifications} className="space-y-4">
        {isCreator ? (
          <>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="comments" defaultChecked={user.notifyComments} />
              New comments
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="likes" defaultChecked={user.notifyLikes} />
              New likes
            </label>
            <fieldset className="space-y-2">
              <legend className="font-medium">New followers and subscribers</legend>
              {tiers.map((tier) => (
                <label key={tier.id} className="flex items-center gap-2">
                  <input type="checkbox" name={`tier-${tier.id}`} defaultChecked={!mutedIds.has(tier.id)} />
                  {tier.name}
                </label>
              ))}
            </fieldset>
          </>
        ) : (
          <>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="posts" defaultChecked={user.notifyPosts} />
              New posts
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="replies" defaultChecked={user.notifyReplies} />
              Replies to my comments
            </label>
          </>
        )}
        <button className={buttonClass}>Save</button>
      </form>
    </section>
  );
}
