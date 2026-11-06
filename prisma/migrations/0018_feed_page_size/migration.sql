-- How many posts a feed loads at a time (scroll batch or page size).
ALTER TABLE "User" ADD COLUMN "feedPageSize" INTEGER NOT NULL DEFAULT 5;
