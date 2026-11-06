-- Fediverse handles were removed from the product.
ALTER TABLE "User" DROP COLUMN "fediverseHandle";

-- Tier presentation: perks checklist, badge and emphasis.
ALTER TABLE "Tier" ADD COLUMN "perks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "badge" TEXT,
ADD COLUMN "highlighted" BOOLEAN NOT NULL DEFAULT false;

-- Images embedded in post text.
ALTER TABLE "PostMedia" ADD COLUMN "inline" BOOLEAN NOT NULL DEFAULT false;

-- Multi-creator instances and the owner who manages them.
ALTER TABLE "InstanceSetting" ADD COLUMN "multiCreator" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ownerId" TEXT;

-- CreateTable
CREATE TABLE "CreatorInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorInvite_tokenHash_key" ON "CreatorInvite"("tokenHash");

-- AddForeignKey
ALTER TABLE "CreatorInvite" ADD CONSTRAINT "CreatorInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
