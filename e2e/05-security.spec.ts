import { expect, test } from "@playwright/test";
import { logInOwner } from "./helpers";

test.describe.configure({ mode: "serial" });

test("scripts need a one-time nonce, and injected markup cannot run", async ({ page, request }) => {
  const response = await request.get("/");
  const csp = response.headers()["content-security-policy"];
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(response.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");

  // The page's own scripts all carry the nonce, and the nonce is different every time.
  const first = (await response.text()).match(/nonce="([^"]+)"/)?.[1];
  const second = (await (await request.get("/")).text()).match(/nonce="([^"]+)"/)?.[1];
  expect(first).toBeTruthy();
  expect(first).not.toBe(second);

  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  await page.goto("/");
  await page.evaluate(() => {
    (window as unknown as { __ran: string[] }).__ran = [];
    const box = document.createElement("div");
    box.innerHTML =
      '<img src="x" onerror="window.__ran.push(\'onerror\')"><a id="js" href="javascript:window.__ran.push(\'href\')">x</a><svg onload="window.__ran.push(\'svg\')"></svg>';
    document.body.appendChild(box);
    document.getElementById("js")!.click();
  });
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as unknown as { __ran: string[] }).__ran)).toEqual([]);
  expect(violations.length).toBeGreaterThan(0);
});

test("the site's own pages run without breaking the policy", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  await logInOwner(page);
  for (const path of ["/", "/dashboard", "/dashboard/posts", "/dashboard/posts/new", "/settings/appearance", "/settings/account", "/login"]) {
    await page.goto(path);
  }
  // The editor is a script-driven component: its word count proves scripts ran under the policy.
  await page.goto("/dashboard/posts/new");
  await page.locator("textarea").first().fill("one two three");
  await expect(page.getByText(/3 words/)).toBeVisible();
  expect(violations).toEqual([]);
});

test("webhooks cannot be pointed at private addresses", async ({ page }) => {
  await logInOwner(page);
  for (const target of ["http://169.254.169.254/latest/meta-data/", "http://localhost:5678/hook", "http://10.0.0.5/hook"]) {
    await page.goto("/settings/webhooks");
    await page.fill('input[name="url"]', target);
    await page.locator('input[name="events"]').first().check();
    await page.getByRole("button", { name: /add|create|save/i }).first().click();
    await expect(page.locator('main [role="alert"]').first()).toContainText("private network");
  }
});

test("the Stripe webhook refuses everything when Stripe is not set up", async ({ request }) => {
  expect((await request.post("/api/stripe/webhook", { data: "{}" })).status()).toBe(503);
});

test("private parts of the site stay closed to visitors", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const path of ["/dashboard", "/settings/account", "/dashboard/posts/new"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
  expect((await context.request.get("/api/v1/posts")).status()).toBe(401);
  expect((await context.request.post("/api/uploads", { data: { contentType: "image/png", size: 10 } })).status()).toBe(403);
  await context.close();
});
