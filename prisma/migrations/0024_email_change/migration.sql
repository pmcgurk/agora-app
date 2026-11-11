-- Changing an email address: the link goes to the NEW address and carries it.
ALTER TYPE "EmailTokenKind" ADD VALUE 'EMAIL_CHANGE';
ALTER TABLE "EmailToken" ADD COLUMN "payload" TEXT;
