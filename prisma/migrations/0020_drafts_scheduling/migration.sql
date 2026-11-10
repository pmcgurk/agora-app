-- Drafts and scheduled posts. publishedAt: null = draft, in the future = scheduled, past = published.
-- announcedAt: when subscribers and webhooks were told about the post (null until then).
ALTER TABLE "Post" ADD COLUMN "publishedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Post" ADD COLUMN "announcedAt" TIMESTAMP(3);

-- Every existing post is already published and announced.
UPDATE "Post" SET "publishedAt" = "createdAt", "announcedAt" = "createdAt";

CREATE INDEX "Post_creatorId_publishedAt_idx" ON "Post"("creatorId", "publishedAt");
