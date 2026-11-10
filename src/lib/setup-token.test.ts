import { afterEach, describe, expect, it } from "vitest";
import { setupLooksPublicAndOpen, setupTokenMatches, setupTokenRequired } from "@/lib/setup-token";

const original = { token: process.env.SETUP_TOKEN, url: process.env.NEXT_PUBLIC_BASE_URL };
afterEach(() => {
  if (original.token === undefined) delete process.env.SETUP_TOKEN;
  else process.env.SETUP_TOKEN = original.token;
  if (original.url === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
  else process.env.NEXT_PUBLIC_BASE_URL = original.url;
});

describe("setup token", () => {
  it("asks for nothing when no token is configured", () => {
    delete process.env.SETUP_TOKEN;
    expect(setupTokenRequired()).toBe(false);
    expect(setupTokenMatches("")).toBe(true);
    expect(setupTokenMatches("anything")).toBe(true);
  });

  it("treats a blank token as not configured", () => {
    process.env.SETUP_TOKEN = "   ";
    expect(setupTokenRequired()).toBe(false);
  });

  it("accepts only the exact token, ignoring surrounding spaces", () => {
    process.env.SETUP_TOKEN = "s3cret-value";
    expect(setupTokenRequired()).toBe(true);
    expect(setupTokenMatches("s3cret-value")).toBe(true);
    expect(setupTokenMatches("  s3cret-value \n")).toBe(true);
    expect(setupTokenMatches("")).toBe(false);
    expect(setupTokenMatches("s3cret-valu")).toBe(false);
    expect(setupTokenMatches("S3CRET-VALUE")).toBe(false);
    expect(setupTokenMatches("s3cret-value-and-more")).toBe(false);
  });

  it("warns on an https site that has no token, and only then", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://blog.example.com";
    delete process.env.SETUP_TOKEN;
    expect(setupLooksPublicAndOpen()).toBe(true);
    process.env.SETUP_TOKEN = "x";
    expect(setupLooksPublicAndOpen()).toBe(false);
    delete process.env.SETUP_TOKEN;
    process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
    expect(setupLooksPublicAndOpen()).toBe(false);
  });
});
