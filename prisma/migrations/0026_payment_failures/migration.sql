-- When a renewal payment failed, so a failing card gets a grace period and the patron is told once.
ALTER TABLE "Subscription" ADD COLUMN "paymentFailedAt" TIMESTAMP(3);
