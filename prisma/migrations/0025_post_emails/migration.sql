-- Emailing new posts to the members who asked for them.

-- Opt-in, off for everyone until they choose it.
ALTER TABLE "User" ADD COLUMN "emailPosts" BOOLEAN NOT NULL DEFAULT false;

-- A secret per person for the unsubscribe link in those emails, so it works without logging in.
ALTER TABLE "User" ADD COLUMN "unsubscribeToken" TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX "User_unsubscribeToken_key" ON "User"("unsubscribeToken");

-- Whether someone signing up asked for emails.
ALTER TABLE "PendingSignup" ADD COLUMN "emailPosts" BOOLEAN NOT NULL DEFAULT false;

-- One row per post and person: queued when the post goes live, sent by a timer a few at a time, never twice.
CREATE TABLE "PostEmail" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "PostEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PostEmail_postId_userId_key" ON "PostEmail"("postId", "userId");
CREATE INDEX "PostEmail_sentAt_createdAt_idx" ON "PostEmail"("sentAt", "createdAt");
ALTER TABLE "PostEmail" ADD CONSTRAINT "PostEmail_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostEmail" ADD CONSTRAINT "PostEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
