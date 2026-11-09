-- How a creator's feed loads: "scroll" (infinite scrolling) or "pages".
ALTER TABLE "User" ADD COLUMN "feedPaging" TEXT NOT NULL DEFAULT 'scroll';
