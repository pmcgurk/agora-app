-- Sign-ups waiting for the address owner to open the link in their email and choose a password.
-- No account exists until then, so the sign-up form cannot be used to learn who is registered.
CREATE TABLE "PendingSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingSignup_email_key" ON "PendingSignup"("email");
CREATE UNIQUE INDEX "PendingSignup_tokenHash_key" ON "PendingSignup"("tokenHash");
