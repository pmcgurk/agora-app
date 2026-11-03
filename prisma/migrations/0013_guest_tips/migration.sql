-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "tipperName" TEXT,
ALTER COLUMN "patronId" DROP NOT NULL;

-- Tips made before names were optional showed the account name.
UPDATE "Payment" SET "tipperName" = "User"."name"
FROM "User"
WHERE "Payment"."kind" = 'TIP' AND "Payment"."patronId" = "User"."id";
