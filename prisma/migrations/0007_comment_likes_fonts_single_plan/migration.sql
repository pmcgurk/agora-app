-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fontBody" TEXT,
ADD COLUMN     "fontHeading" TEXT;

-- CreateTable
CREATE TABLE "CommentLike" (
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("commentId","userId")
);

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One active plan per patron and creator: keep the highest-priced, cancel the rest.
UPDATE "Subscription" s
SET "status" = 'CANCELED'
FROM "Tier" t
WHERE s."tierId" = t."id"
  AND s."status" = 'ACTIVE'
  AND EXISTS (
    SELECT 1
    FROM "Subscription" s2
    JOIN "Tier" t2 ON t2."id" = s2."tierId"
    WHERE s2."patronId" = s."patronId"
      AND t2."creatorId" = t."creatorId"
      AND s2."status" = 'ACTIVE'
      AND s2."id" <> s."id"
      AND (t2."price" > t."price" OR (t2."price" = t."price" AND s2."id" > s."id"))
  );
