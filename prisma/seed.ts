import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Demo credentials for local evaluation only; never seed a public instance.
const DEMO_PASSWORD = "demo-password";

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const creator = await prisma.user.upsert({
    where: { email: "demo@agora.local" },
    update: {},
    create: {
      id: "demo-creator",
      name: "Demo Creator",
      slug: "demo",
      tagline: "A demo creator page",
      email: "demo@agora.local",
      passwordHash,
      fediverseHandle: "@demo@agora.local",
      role: "CREATOR",
      onboardedAt: new Date(),
      acceptsPayments: true,
      themeSettings: { name: "Teal", primary: "#0f766e", secondary: "#ccfbf1", background: "#f0fdfa", text: "#134e4a" },
    },
  });

  await prisma.tier.upsert({
    where: { id: "demo-tier-follower" },
    update: {},
    create: { id: "demo-tier-follower", creatorId: creator.id, name: "Follower", price: 0, description: "Follow for updates and public posts." },
  });

  const tier = await prisma.tier.upsert({
    where: { id: "demo-tier-supporter" },
    update: {},
    create: { id: "demo-tier-supporter", creatorId: creator.id, name: "Supporter", price: 500, description: "Early access to every post and behind-the-scenes extras." },
  });

  await prisma.user.upsert({
    where: { email: "patron@agora.local" },
    update: {},
    create: { name: "Demo Patron", email: "patron@agora.local", passwordHash, role: "PATRON" },
  });

  await prisma.post.upsert({
    where: { id: "demo-post-public" },
    update: {},
    create: {
      id: "demo-post-public",
      creatorId: creator.id,
      title: "Welcome to Agora",
      textContent: "This is a public post.",
      isPublic: true,
    },
  });

  await prisma.post.upsert({
    where: { id: "demo-post-gated" },
    update: {},
    create: {
      id: "demo-post-gated",
      creatorId: creator.id,
      title: "Supporters only",
      textContent: "This content is gated.",
      isPublic: false,
      minTierId: tier.id,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
