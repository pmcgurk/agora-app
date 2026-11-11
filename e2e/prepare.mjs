// Runs before the browser tests: wipes and rebuilds the test database, and empties the mail catcher.
// The database must be one made for this, so its name has to contain "e2e".
import { execFileSync } from "node:child_process";

const url = process.env.E2E_DATABASE_URL;
if (!url) {
  console.error("Set E2E_DATABASE_URL to a throwaway database, for example postgresql://postgres:postgres@localhost:5432/agora_e2e");
  process.exit(1);
}
const name = new URL(url).pathname.slice(1);
if (!/e2e/i.test(name)) {
  console.error(`Refusing to reset "${name}": the browser tests wipe their database, so its name must contain "e2e".`);
  process.exit(1);
}

console.log(`Resetting database ${name}...`);
execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "reset", "--force"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: url },
});

// Next.js bakes NEXT_PUBLIC_* values into the build, so the build must be made for the address the tests use.
// (A .env file with another address would otherwise end up in the emails the site sends.)
if (!process.env.E2E_SKIP_BUILD) {
  console.log("Building the site...");
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, DATABASE_URL: url, NEXT_PUBLIC_BASE_URL: `http://localhost:${process.env.E2E_PORT ?? 3100}` },
  });
}

const mail = process.env.E2E_MAIL_API ?? "http://localhost:8025";
try {
  await fetch(`${mail}/api/v1/messages`, { method: "DELETE" });
  console.log("Emptied the mail catcher.");
} catch {
  console.error(`The mail catcher is not reachable at ${mail}. Start one (for example: docker run -p 1025:1025 -p 8025:8025 axllent/mailpit).`);
  process.exit(1);
}
