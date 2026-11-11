import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { APP_VERSION, commitSha, versionLabel } from "@/lib/version";

describe("version", () => {
  it("is the version in package.json", () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("shows just the version when the commit is unknown", () => {
    expect(versionLabel({})).toBe(`v${APP_VERSION}`);
  });

  it("adds a short commit when the host provides one", () => {
    expect(versionLabel({ GIT_SHA: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" })).toBe(`v${APP_VERSION} (a1b2c3d)`);
    expect(commitSha({ RENDER_GIT_COMMIT: "ABCDEF1234567" })).toBe("abcdef1");
    expect(commitSha({ SOURCE_COMMIT: "1234567" })).toBe("1234567");
    expect(commitSha({ VERCEL_GIT_COMMIT_SHA: "deadbeefcafe" })).toBe("deadbee");
  });

  it("ignores anything that is not a commit hash, so odd values never reach a page", () => {
    expect(commitSha({ GIT_SHA: "<script>alert(1)</script>" })).toBeNull();
    expect(commitSha({ GIT_SHA: "not-a-hash" })).toBeNull();
    expect(commitSha({ GIT_SHA: "abc" })).toBeNull();
    expect(versionLabel({ GIT_SHA: "unknown" })).toBe(`v${APP_VERSION}`);
  });
});
