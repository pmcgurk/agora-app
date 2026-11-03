ALTER TABLE "User" ADD COLUMN "onboardedAt" TIMESTAMP(3),
ADD COLUMN "acceptsPayments" BOOLEAN NOT NULL DEFAULT false;

-- Existing accounts predate onboarding: treat them as onboarded and keep paid tiers working.
UPDATE "User" SET "onboardedAt" = CURRENT_TIMESTAMP;
UPDATE "User" SET "acceptsPayments" = true
WHERE "role" = 'CREATOR' AND EXISTS (SELECT 1 FROM "Tier" WHERE "Tier"."creatorId" = "User"."id" AND "Tier"."price" > 0);
