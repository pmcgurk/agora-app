import pkg from "../../package.json";

// The version in package.json, which the "Version" workflow bumps by one patch number on every push to main.
export const APP_VERSION: string = pkg.version;

// The commit this build came from, when the host tells us. Render, Coolify, Vercel and Docker builds that
// pass --build-arg GIT_SHA=... are all understood.
export function commitSha(env: Record<string, string | undefined> = process.env): string | null {
  const sha = env.GIT_SHA || env.RENDER_GIT_COMMIT || env.SOURCE_COMMIT || env.VERCEL_GIT_COMMIT_SHA || "";
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : null;
}

// "v0.1.14" or, when the commit is known, "v0.1.14 (a1b2c3d)". Shown in the footer and /api/health, for
// working out which build a site is running.
export function versionLabel(env: Record<string, string | undefined> = process.env): string {
  const sha = commitSha(env);
  return sha ? `v${APP_VERSION} (${sha})` : `v${APP_VERSION}`;
}
