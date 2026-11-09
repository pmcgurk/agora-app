import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_PASSWORD, prepareDemoAssets, writeDemoData } from "../src/lib/demo-data";

// Realistic sample data for a single-creator site: a ceramics creator with three tiers, a dozen
// posts, two patrons and a few weeks of views. Used for the README screenshots and for trying
// Agora out. It refuses to run on a database that already has accounts.
//
//   npm run demo:seed
//
// For a public showcase with a replayable setup wizard and an hourly reset, set DEMO_MODE=true
// instead (see "Run a public demo" in the README). Never seed a real instance.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  if ((await prisma.user.count()) > 0) {
    throw new Error("This database already has accounts. Point DATABASE_URL at an empty database for the demo.");
  }
  const assets = await prepareDemoAssets();
  await prisma.$transaction((tx) => writeDemoData(tx, assets), { timeout: 60_000 });

  console.log("Demo data created.");
  console.log("Creator: maya@example.com");
  console.log("Patrons: jordan@example.com (Maker Club), priya@example.com (Studio Friend)");
  console.log(`Password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
