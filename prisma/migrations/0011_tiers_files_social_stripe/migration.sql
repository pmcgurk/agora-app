-- AlterEnum
ALTER TYPE "MediaKind" ADD VALUE 'FILE';

-- AlterTable
ALTER TABLE "InstanceSetting" ADD COLUMN     "stripeSecretKey" TEXT,
ADD COLUMN     "stripeWebhookSecret" TEXT;

-- AlterTable
ALTER TABLE "PostMedia" ADD COLUMN     "fileName" TEXT;

-- AlterTable
ALTER TABLE "Tier" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "socialLinks" JSONB;
