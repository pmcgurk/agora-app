import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/secrets", () => ({ decryptSecret: (value: string) => value }));

import { cleanDisplayName, cleanReplyTo, composeFrom } from "@/lib/mail";

describe("send as", () => {
  it("keeps the site's own From when the creator chose no name", () => {
    expect(composeFrom("Site <mail@blog.example.com>", null)).toBe("Site <mail@blog.example.com>");
    expect(composeFrom("mail@blog.example.com", "   ")).toBe("mail@blog.example.com");
  });

  it("changes only the name, and always sends from the site's address", () => {
    expect(composeFrom("Site <mail@blog.example.com>", "Paul McGurk")).toEqual({ name: "Paul McGurk", address: "mail@blog.example.com" });
    expect(composeFrom("mail@blog.example.com", "Paul")).toEqual({ name: "Paul", address: "mail@blog.example.com" });
  });

  it("cannot be used to inject a header or a second address", () => {
    expect(cleanDisplayName("Paul\r\nBcc: spy@example.com")).toBe("Paul Bcc: spy@example.com");
    expect(cleanDisplayName('Paul" <boss@bank.example>')).toBe("Paul boss@bank.example");
    expect(cleanDisplayName("a".repeat(200))).toHaveLength(60);
    expect(cleanDisplayName("\n\t ")).toBeNull();
  });

  it("falls back to the site's From when it cannot be read as an address", () => {
    expect(composeFrom("not an address", "Paul")).toBe("not an address");
  });

  it("accepts a reply-to that is a plain address, and nothing else", () => {
    expect(cleanReplyTo(" paul@example.com ")).toBe("paul@example.com");
    expect(cleanReplyTo("paul@example.com, other@example.com")).toBeNull();
    expect(cleanReplyTo("Paul <paul@example.com>")).toBeNull();
    expect(cleanReplyTo("paul@example.com\r\nBcc: x@example.com")).toBeNull();
    expect(cleanReplyTo("")).toBeNull();
    expect(cleanReplyTo(null)).toBeNull();
  });
});
