import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Placeholder lets `prisma generate` run (install/build) without a configured database.
    url: process.env.DATABASE_URL
      ? env("DATABASE_URL")
      : "postgresql://placeholder@localhost:5432/agora",
  },
});
