import { prisma } from "@/lib/prisma";

// Atomic per-day counters; no visitor identifiers are stored.
export async function recordPostView(postId: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "PostViewDay" ("postId", "day", "views") VALUES (${postId}, CURRENT_DATE, 1)
    ON CONFLICT ("postId", "day") DO UPDATE SET "views" = "PostViewDay"."views" + 1`;
}

export async function recordProfileView(creatorId: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "ProfileViewDay" ("creatorId", "day", "views") VALUES (${creatorId}, CURRENT_DATE, 1)
    ON CONFLICT ("creatorId", "day") DO UPDATE SET "views" = "ProfileViewDay"."views" + 1`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(offsetDays: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + offsetDays * DAY_MS);
}

export async function getViewAnalytics(creatorId: string) {
  const since = utcDay(-29);
  const [profileRows, postRows, totals] = await Promise.all([
    prisma.profileViewDay.findMany({ where: { creatorId, day: { gte: since } } }),
    prisma.postViewDay.findMany({ where: { post: { creatorId }, day: { gte: since } } }),
    prisma.postViewDay.groupBy({ by: ["postId"], where: { post: { creatorId } }, _sum: { views: true } }),
  ]);

  // One entry per day for the last 30 days, oldest first.
  const daily = Array.from({ length: 30 }, (_, index) => {
    const day = utcDay(index - 29);
    const key = day.toISOString().slice(0, 10);
    const matches = (row: { day: Date }) => row.day.toISOString().slice(0, 10) === key;
    return {
      day: key,
      profile: profileRows.filter(matches).reduce((sum, row) => sum + row.views, 0),
      posts: postRows.filter(matches).reduce((sum, row) => sum + row.views, 0),
    };
  });

  const last7 = daily.slice(-7);
  return {
    daily,
    profile30: daily.reduce((sum, day) => sum + day.profile, 0),
    profile7: last7.reduce((sum, day) => sum + day.profile, 0),
    posts30: daily.reduce((sum, day) => sum + day.posts, 0),
    posts7: last7.reduce((sum, day) => sum + day.posts, 0),
    perPostTotal: new Map(totals.map((row) => [row.postId, row._sum.views ?? 0])),
  };
}
