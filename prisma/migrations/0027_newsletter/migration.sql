-- Newsletters: a creator can send the whole post by email, choose the name it comes from and where replies go,
-- and switch emailing off for a single post.

CREATE TYPE "NewsletterFormat" AS ENUM ('EXCERPT', 'FULL');

ALTER TABLE "User" ADD COLUMN "newsletterFormat" "NewsletterFormat" NOT NULL DEFAULT 'EXCERPT';
ALTER TABLE "User" ADD COLUMN "emailFromName" TEXT;
ALTER TABLE "User" ADD COLUMN "emailReplyTo" TEXT;

ALTER TABLE "Post" ADD COLUMN "sendEmail" BOOLEAN NOT NULL DEFAULT true;
