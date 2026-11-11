import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

// In development the server reloads code as you edit but keeps module-level state, so a database client made before
// the schema changed would otherwise live on, unaware of new columns, and every write that mentions one would fail.
// The client is remembered together with a fingerprint of the schema it was generated from, and replaced when that
// changes (after `prisma generate`).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaSchema?: string };

const schemaFingerprint = () =>
  Object.entries(Prisma)
    .filter(([name]) => name.endsWith("ScalarFieldEnum"))
    .map(([name, fields]) => `${name}:${Object.keys(fields as object).join(",")}`)
    .join("|");

function client(): PrismaClient {
  const fingerprint = schemaFingerprint();
  const existing = globalForPrisma.prisma;
  if (existing && globalForPrisma.prismaSchema === fingerprint) return existing;
  void existing?.$disconnect().catch(() => undefined);
  const created = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = created;
    globalForPrisma.prismaSchema = fingerprint;
  }
  return created;
}

export const prisma = client();
