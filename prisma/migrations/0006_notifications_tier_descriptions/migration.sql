-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyComments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyLikes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyPosts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyReplies" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Tier" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "parentId" TEXT;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierMute" (
    "userId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,

    CONSTRAINT "TierMute_pkey" PRIMARY KEY ("userId","tierId")
);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierMute" ADD CONSTRAINT "TierMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierMute" ADD CONSTRAINT "TierMute_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
