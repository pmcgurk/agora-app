-- Custom thank-you messages: per tier (shown after joining) and per creator (shown after a tip).
ALTER TABLE "Tier" ADD COLUMN "welcomeMessage" TEXT;
ALTER TABLE "User" ADD COLUMN "tipThanks" TEXT;
