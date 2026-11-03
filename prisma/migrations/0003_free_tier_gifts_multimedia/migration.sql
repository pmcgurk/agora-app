-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "gifted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "allowBlurPreview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "previewSeconds" INTEGER;

-- CreateTable
CREATE TABLE "PostMedia" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "blurObjectKey" TEXT,
    "previewObjectKey" TEXT,

    CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("id")
);

-- Move each legacy single attachment into PostMedia (size is unknown, so 0).
INSERT INTO "PostMedia" ("id", "postId", "position", "kind", "contentType", "size", "objectKey")
SELECT 'm' || md5("id" || random()::text), "id", 0,
  CASE WHEN "mediaContentType" LIKE 'video/%' THEN 'VIDEO'::"MediaKind"
       WHEN "mediaContentType" LIKE 'audio/%' THEN 'AUDIO'::"MediaKind"
       ELSE 'IMAGE'::"MediaKind" END,
  "mediaContentType", 0, "mediaObjectKey"
FROM "Post" WHERE "mediaObjectKey" IS NOT NULL AND "mediaContentType" IS NOT NULL;

ALTER TABLE "Post" DROP COLUMN "mediaContentType", DROP COLUMN "mediaObjectKey";

-- Every creator gets a free "Follower" tier.
INSERT INTO "Tier" ("id", "creatorId", "name", "price")
SELECT 't' || md5("id" || random()::text), "id", 'Follower', 0
FROM "User" u WHERE u."role" = 'CREATOR'
  AND NOT EXISTS (SELECT 1 FROM "Tier" t WHERE t."creatorId" = u."id" AND t."price" = 0);

-- CreateIndex
CREATE INDEX "PostMedia_postId_idx" ON "PostMedia"("postId");

-- CreateIndex
CREATE INDEX "Subscription_tierId_idx" ON "Subscription"("tierId");

-- AddForeignKey
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

