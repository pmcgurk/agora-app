import "dotenv/config";
import { createEmailToken } from "../src/lib/email-tokens";
import { prisma } from "../src/lib/prisma";

// Prints a one-hour password reset link for an account, straight from the server. Use it when email is not
// set up, or when the owner is locked out. Anyone who can run it already controls the database.
//
//   npm run reset-link -- you@example.com
//   docker compose exec app npx tsx prisma/reset-link.ts you@example.com

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run reset-link -- you@example.com");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) throw new Error(`No account uses ${email}.`);

  const token = await createEmailToken(user.id, "PASSWORD_RESET");
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  console.log(`Reset link for ${user.name} <${email}>. It works once and expires in an hour:\n`);
  console.log(`${base}/reset-password/${token}\n`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
