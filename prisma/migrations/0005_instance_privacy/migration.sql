CREATE TABLE "InstanceSetting" (
    "id" TEXT NOT NULL DEFAULT 'instance',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InstanceSetting_pkey" PRIMARY KEY ("id")
);
