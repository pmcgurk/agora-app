import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const { getStripeConfig, constructEvent, handleStripeEvent, create, remove } = vi.hoisted(() => ({
  getStripeConfig: vi.fn(),
  constructEvent: vi.fn(),
  handleStripeEvent: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/payments", () => ({ getStripeConfig }));
vi.mock("@/lib/stripe", () => ({ getStripe: async () => ({ webhooks: { constructEvent } }) }));
vi.mock("@/lib/stripe-events", () => ({ handleStripeEvent }));
vi.mock("@/lib/prisma", () => ({ prisma: { stripeEvent: { create, delete: remove } } }));

import { POST } from "@/app/api/stripe/webhook/route";

const request = (headers: Record<string, string> = { "stripe-signature": "t=1,v1=abc" }) =>
  new Request("http://localhost/api/stripe/webhook", { method: "POST", headers, body: '{"id":"evt_1"}' });

const event = { id: "evt_1", type: "invoice.paid" };

beforeEach(() => {
  getStripeConfig.mockResolvedValue({ secretKey: "sk_test_x", webhookSecret: "whsec_x" });
  constructEvent.mockReturnValue(event);
  handleStripeEvent.mockResolvedValue(undefined);
  create.mockResolvedValue({});
  remove.mockResolvedValue({});
});

describe("Stripe webhook endpoint", () => {
  it("answers 503 when Stripe is not configured", async () => {
    getStripeConfig.mockResolvedValue({ secretKey: null, webhookSecret: null });
    expect((await POST(request())).status).toBe(503);
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature header", async () => {
    expect((await POST(request({}))).status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it("rejects a bad signature without touching the database or the handler", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it("verifies the raw body with the configured signing secret", async () => {
    await POST(request());
    expect(constructEvent).toHaveBeenCalledWith('{"id":"evt_1"}', "t=1,v1=abc", "whsec_x");
  });

  it("handles a new event once and reports success", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(create).toHaveBeenCalledWith({ data: { id: "evt_1", type: "invoice.paid" } });
    expect(handleStripeEvent).toHaveBeenCalledExactlyOnceWith(event);
  });

  it("ignores a duplicate delivery of the same event", async () => {
    create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "test" }));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: true });
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it("does not hide other database errors", async () => {
    create.mockRejectedValue(new Error("connection lost"));
    await expect(POST(request())).rejects.toThrow("connection lost");
    expect(handleStripeEvent).not.toHaveBeenCalled();
  });

  it("releases the claim when handling fails, so Stripe's retry is processed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    handleStripeEvent.mockRejectedValue(new Error("boom"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(remove).toHaveBeenCalledWith({ where: { id: "evt_1" } });
  });
});
