import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup }));

import { assertPublicTarget, isPrivateAddress } from "@/lib/net-guard";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fd12:3456::1",
    "fc00::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe", // 169.254.169.254 written in hex
    "[::1]",
    "not an address",
  ])("treats %s as private", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["1.1.1.1", "8.8.8.8", "93.184.216.34", "172.15.0.1", "172.32.0.1", "100.63.255.255", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "treats %s as public",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});

describe("assertPublicTarget", () => {
  beforeEach(() => {
    lookup.mockReset();
    delete process.env.WEBHOOK_ALLOW_PRIVATE;
  });
  afterEach(() => {
    delete process.env.WEBHOOK_ALLOW_PRIVATE;
  });

  it("accepts a name that resolves to public addresses", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(assertPublicTarget("https://example.com/hook")).resolves.toBeUndefined();
  });

  it("refuses a name that resolves to a private address", async () => {
    lookup.mockResolvedValue([{ address: "10.0.0.7", family: 4 }]);
    await expect(assertPublicTarget("https://internal.example.com/hook")).rejects.toThrow("private network");
  });

  it("refuses a name when any one of its addresses is private (round-robin tricks)", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(assertPublicTarget("https://mixed.example.com/")).rejects.toThrow("private network");
  });

  it("checks address literals without a lookup", async () => {
    await expect(assertPublicTarget("http://169.254.169.254/latest/meta-data/")).rejects.toThrow("private network");
    await expect(assertPublicTarget("http://[::1]:8080/")).rejects.toThrow("private network");
    await expect(assertPublicTarget("http://8.8.8.8/")).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses localhost", async () => {
    lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(assertPublicTarget("http://localhost:3000/")).rejects.toThrow("private network");
  });

  it("refuses a name that does not resolve", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertPublicTarget("https://nope.invalid/")).rejects.toThrow("could not be found");
  });

  it("lets private targets through when the operator opts in", async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE = "true";
    await expect(assertPublicTarget("http://127.0.0.1:5678/webhook")).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });
});
