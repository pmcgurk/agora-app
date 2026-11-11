import { setEmailPosts } from "@/app/actions/notifications";
import EndPlan from "@/components/EndPlan";
import Link from "next/link";
import { after } from "next/server";
import Flash from "@/components/Flash";
import InfinitePosts from "@/components/InfinitePosts";
import PostArticles from "@/components/PostArticles";
import UnpublishedStrip from "@/components/UnpublishedStrip";
import { cardClass, inputClass, linkClass, secondaryButtonClass } from "@/components/ui";
import { activeSubscriptionWhere, getAccessContext } from "@/lib/access";
import NewPostsBanner from "@/components/NewPostsBanner";
import { cleanSearch, fetchPosts, MAX_SEARCH_LENGTH, pageSizeOf } from "@/lib/feed";
import { patronCanMessage } from "@/lib/dm";
import { mailIsConfigured } from "@/lib/account-email";
import { getCurrentUser } from "@/lib/auth";
import { creatorPath, getCreator, supportPath } from "@/lib/creator";
import { prisma } from "@/lib/prisma";
import { recordProfileView } from "@/lib/views";

type Creator = NonNullable<Awaited<ReturnType<typeof getCreator>>>;

export default async function CreatorFeed({
  creator,
  notice,
  error,
  q,
  page,
}: {
  creator: Creator;
  notice?: string;
  error?: string;
  q?: string;
  page?: string;
}) {
  const viewer = await getCurrentUser();
  const access = await getAccessContext(creator.id, viewer);
  if (!access.isOwner) after(() => recordProfileView(creator.id));

  const query = cleanSearch(q);
  const pageNumber = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
  const paged = creator.feedPaging === "pages";
  const [tiers, feed, subscriptions] = await Promise.all([
    prisma.tier.findMany({ where: { creatorId: creator.id }, orderBy: { price: "asc" } }),
    fetchPosts({ creatorId: creator.id, access, q: query, pageSize: pageSizeOf(creator), ...(paged ? { page: pageNumber } : {}) }),
    viewer
      ? prisma.subscription.findMany({
          where: { patronId: viewer.id, tier: { creatorId: creator.id }, ...activeSubscriptionWhere() },
          select: { id: true, tierId: true, expiresAt: true, cancelAtPeriodEnd: true, gifted: true },
        })
      : [],
  ]);
  const { posts } = feed;
  const pageLink = (target: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (target > 1) params.set("page", String(target));
    return params.size ? `?${params}` : "?";
  };
  const memberTier =
    tiers.filter((tier) => subscriptions.some((subscription) => subscription.tierId === tier.id)).at(-1) ?? null;
  const memberPlan = subscriptions.find((subscription) => subscription.tierId === memberTier?.id) ?? null;
  const base = creatorPath(creator);
  // Members of a site that can send email may ask for new posts by email, right from the page they follow.
  const emailOffer = viewer?.role === "PATRON" && viewer.id !== creator.id && memberTier !== null && (await mailIsConfigured());
  const supportHref = await supportPath(creator);
  const dmGate =
    viewer !== null && viewer.id !== creator.id && viewer.role === "PATRON" && !access.blocked
      ? await patronCanMessage(creator, viewer.id)
      : null;
  const canMessage = dmGate?.allowed === true;
  const dmLocked = dmGate && !dmGate.allowed && creator.allowDMs ? dmGate.reason : null;

  return (
    <>
      {creator.bio && <p className="whitespace-pre-wrap text-muted">{creator.bio}</p>}
      <Flash notice={notice} error={error} />


      {viewer?.id !== creator.id && (memberTier || canMessage || dmLocked) && (
        <section aria-label="Membership" className={`${cardClass} agora-tier flex flex-wrap items-center justify-between gap-3`}>
          {memberTier && (
            <p>{memberTier.price === 0 ? "You follow this creator." : `You're a ${memberTier.name} member.`}</p>
          )}
          {memberPlan && !memberPlan.gifted && memberTier && viewer?.role === "PATRON" && (
            <EndPlan subscription={memberPlan} paid={memberTier.price > 0} returnTo={base} />
          )}
          {emailOffer && viewer && (
            <form action={setEmailPosts}>
              <input type="hidden" name="returnTo" value={base} />
              {!viewer.emailPosts && <input type="hidden" name="emailPosts" value="on" />}
              <button className="text-sm underline">{viewer.emailPosts ? "Stop emailing me new posts" : "Email me new posts"}</button>
            </form>
          )}
          {dmLocked && <span className="text-sm text-muted">{dmLocked}</span>}
          {canMessage && <Link href={`/messages/${creator.id}`} className={linkClass}>Message</Link>}
          {memberTier && tiers.some((tier) => tier.price > 0 && tier.active) && (
            <Link href={supportHref} className={linkClass}>Change plan</Link>
          )}
        </section>
      )}

      {access.isOwner && !query && pageNumber === 1 && <UnpublishedStrip creatorId={creator.id} />}

      {(posts.length > 0 || query) && (
        <form role="search" className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            maxLength={MAX_SEARCH_LENGTH}
            placeholder="Search posts"
            aria-label="Search posts"
            className={`${inputClass} mt-0!`}
          />
          <button className={secondaryButtonClass}>Search</button>
        </form>
      )}
      {query && (
        <p className="text-sm text-muted">
          {posts.length === 0 ? "No posts match" : "Showing posts matching"} “{query}”.{" "}
          <Link href="?" className={linkClass}>Clear search</Link>
        </p>
      )}

      {!query && pageNumber === 1 && <NewPostsBanner key={posts[0]?.id ?? "none"} creatorId={creator.id} since={(posts[0]?.publishedAt ?? posts[0]?.createdAt)?.toISOString() ?? new Date().toISOString()} />}

      <section aria-label="Posts" className="space-y-4">
        <PostArticles creator={creator} posts={posts} />
        {!paged && feed.nextCursor && <InfinitePosts key={`${query}:${posts[0]?.id}`} creatorId={creator.id} q={query} initialCursor={feed.nextCursor} />}
        {posts.length === 0 && !query && <p className="text-muted">No posts yet.</p>}
      </section>

      {paged && (pageNumber > 1 || feed.hasMore) && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {pageNumber > 1 ? <Link href={pageLink(pageNumber - 1)} className={linkClass}>← Newer posts</Link> : <span />}
          <span className="text-muted">Page {pageNumber}</span>
          {feed.hasMore ? <Link href={pageLink(pageNumber + 1)} className={linkClass}>Older posts →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
