import { expect, test } from "@playwright/test";
import { OWNER, SETUP_TOKEN, newVisitor } from "./helpers";

test.describe.configure({ mode: "serial" });

async function fillSetup(page: import("@playwright/test").Page, token: string) {
  await page.goto("/setup");
  await page.fill('input[name="name"]', OWNER.name);
  await page.fill('input[name="email"]', OWNER.email);
  await page.fill('input[name="password"]', OWNER.password);
  await page.fill('input[name="setupToken"]', token);
}

test("a fresh site sends everyone to setup, which asks for the token", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup/);
  await expect(page.locator('input[name="setupToken"]')).toBeVisible();
  // The warning for open setups does not show when a token is required.
  await expect(page.getByText("Heads up")).toHaveCount(0);
});

test("a wrong setup token creates nothing", async ({ page }) => {
  await fillSetup(page, "not-the-token");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/error=/);
  await expect(page.locator('main [role="alert"]')).toContainText("setup token");
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup/);
});

test("two people finishing setup at the same moment end up with one owner", async ({ browser }) => {
  const [one, two] = [await newVisitor(browser), await newVisitor(browser)];
  await fillSetup(one.page, SETUP_TOKEN);
  await fillSetup(two.page, SETUP_TOKEN);
  await Promise.all([
    one.page.getByRole("button", { name: "Create account" }).click(),
    two.page.getByRole("button", { name: "Create account" }).click(),
  ]);
  await Promise.all([one.page.waitForLoadState("networkidle"), two.page.waitForLoadState("networkidle")]);
  await expect.poll(() => [one.page.url(), two.page.url()].filter((url) => url.includes("/onboarding")).length).toBe(1);
  await expect.poll(() => [one.page.url(), two.page.url()].filter((url) => url.includes("/login")).length).toBe(1);

  // Finish the winner's setup.
  const winner = one.page.url().includes("/onboarding") ? one.page : two.page;
  await winner.getByRole("button", { name: /skip setup/i }).click();
  await expect(winner).toHaveURL(/\/dashboard/);
  await one.context.close();
  await two.context.close();
});

test("setup is closed once the owner exists", async ({ page }) => {
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/login/);
});
