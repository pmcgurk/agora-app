import { expect, test } from "@playwright/test";
import { OWNER, clearMailbox, linkIn, logIn, mailArrives, newVisitor, signUpMember, waitForMail } from "./helpers";

test.describe.configure({ mode: "serial" });

const PAT = { name: "Pat Member", email: "pat@example.test", password: "pat-password-123" };
const POST_PATH = "/posts/hello-world-hello-agora";

test("signing up sends a link, and the account only exists once its owner finishes", async ({ browser }) => {
  const { context, page } = await newVisitor(browser);
  await signUpMember(page, PAT);
  // Signed in, and no "confirm your email" nag: opening the link already confirmed it.
  await expect(page.getByRole("region", { name: "Confirm your email" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await context.close();
});

test("signing up with an address that already has an account looks exactly the same", async ({ browser }) => {
  const fresh = await newVisitor(browser);
  await fresh.page.goto("/signup");
  await fresh.page.fill('input[name="name"]', "Someone New");
  await fresh.page.fill('input[name="email"]', "brand-new@example.test");
  await fresh.page.getByRole("button", { name: "Send me the link" }).click();
  await expect(fresh.page).toHaveURL(/\/signup\/check-email/);
  const forNew = await fresh.page.locator("main").innerText();

  await clearMailbox();
  const existing = await newVisitor(browser);
  await existing.page.goto("/signup");
  await existing.page.fill('input[name="name"]', "Someone Else");
  await existing.page.fill('input[name="email"]', PAT.email);
  await existing.page.getByRole("button", { name: "Send me the link" }).click();
  await expect(existing.page).toHaveURL(/\/signup\/check-email/);
  const forExisting = await existing.page.locator("main").innerText();

  expect(forExisting).toBe(forNew);
  // The real owner of the address is told, privately, that it already has an account.
  const notice = await waitForMail(PAT.email, "already have an account");
  expect(notice.text).toContain("/login");
  await fresh.context.close();
  await existing.context.close();
});

test("a sign-up link works once and a typo in the password does not use it up", async ({ browser }) => {
  const { context, page } = await newVisitor(browser);
  await clearMailbox();
  await page.goto("/signup");
  await page.fill('input[name="name"]', "Link Tester");
  await page.fill('input[name="email"]', "link@example.test");
  await page.getByRole("button", { name: "Send me the link" }).click();
  const link = linkIn((await waitForMail("link@example.test", "Finish signing up")).text, "/signup/finish/");
  await page.goto(link);
  await page.fill('input[name="password"]', "a-good-password-1");
  await page.fill('input[name="confirm"]', "a-different-one-2");
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.locator('main [role="alert"]')).toContainText("do not match");
  await page.fill('input[name="password"]', "a-good-password-1");
  await page.fill('input[name="confirm"]', "a-good-password-1");
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page).toHaveURL(/\/\?notice=/);
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page.getByRole("note")).toContainText("expired or was already used");
  await context.close();
});

test("a member can comment", async ({ browser }) => {
  const { context, page } = await newVisitor(browser);
  await logIn(page, PAT.email, PAT.password);
  await page.goto(POST_PATH);
  await page.locator("textarea").first().fill("Lovely first post!");
  await page.getByRole("button", { name: /^(post|comment|send|reply)/i }).last().click();
  await expect(page.getByText("Lovely first post!")).toBeVisible();
  await context.close();
});

test("forgotten passwords: the same answer for everyone, one use per link", async ({ browser }) => {
  const { context, page } = await newVisitor(browser);
  const ask = async (email: string) => {
    await page.goto("/forgot-password");
    await page.fill('input[name="email"]', email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page).toHaveURL(/sent=1/);
    return page.locator('main [role="status"]').innerText();
  };
  const unknown = await ask("nobody@example.test");
  await clearMailbox();
  const known = await ask(PAT.email);
  expect(known).toBe(unknown);
  expect(await mailArrives("nobody@example.test", "Reset your", 2_500)).toBe(false);

  const link = linkIn((await waitForMail(PAT.email, "Reset your")).text, "/reset-password/");
  await page.goto(link);
  await page.fill('input[name="password"]', "brand-new-password-9");
  await page.fill('input[name="confirm"]', "something-else-entirely");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.locator('main [role="alert"]')).toContainText("do not match");
  await page.fill('input[name="password"]', "brand-new-password-9");
  await page.fill('input[name="confirm"]', "brand-new-password-9");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/login\?notice=/);
  PAT.password = "brand-new-password-9";

  await page.goto(link);
  await expect(page.getByRole("note")).toContainText("expired or was already used");
  await logIn(page, PAT.email, "pat-password-123");
  await expect(page).toHaveURL(/error=/);
  await logIn(page, PAT.email, PAT.password);
  await expect(page).not.toHaveURL(/\/login/);
  await context.close();
});

test("changing email: the new address confirms it, the old one is told, other devices are signed out", async ({ browser }) => {
  const { context, page } = await newVisitor(browser);
  await logIn(page, PAT.email, PAT.password);
  await clearMailbox();
  await page.goto("/settings/account");
  await page.fill('input[name="newEmail"]', "pat.new@example.test");
  await page.locator('form:has(input[name="newEmail"]) input[name="password"]').fill(PAT.password);
  await page.getByRole("button", { name: "Change email" }).click();
  await expect(page.locator('main [role="status"]')).toContainText("We sent a confirmation link to pat.new@example.test");

  // Nothing changes until the new address's owner opens the link.
  const link = linkIn((await waitForMail("pat.new@example.test", "Confirm your new email")).text, "/confirm-email-change/");
  await page.goto("/settings/account");
  await expect(page.getByText("Signed in as")).toContainText(PAT.email);

  await page.goto(link);
  await page.getByRole("button", { name: "Confirm the change" }).click();
  await expect(page).toHaveURL(/\/login\?notice=/);
  const told = await waitForMail(PAT.email, "email address was changed");
  expect(told.text).toContain("pat.new@example.test");

  await logIn(page, PAT.email, PAT.password);
  await expect(page).toHaveURL(/error=/);
  PAT.email = "pat.new@example.test";
  await logIn(page, PAT.email, PAT.password);
  await expect(page).not.toHaveURL(/\/login/);
  await context.close();
});

test("asking to move to an address that is taken looks the same, and warns its owner", async ({ browser }) => {
  const { context, page } = await newVisitor(browser);
  await logIn(page, PAT.email, PAT.password);
  await clearMailbox();
  await page.goto("/settings/account");
  await page.fill('input[name="newEmail"]', "owner@example.test");
  await page.locator('form:has(input[name="newEmail"]) input[name="password"]').fill(PAT.password);
  await page.getByRole("button", { name: "Change email" }).click();
  await expect(page.locator('main [role="status"]')).toContainText("We sent a confirmation link to owner@example.test");
  await waitForMail("owner@example.test", "About your");
  await context.close();
});

test("you can download your data, without anything that is not yours", async ({ browser }) => {
  const { context, page } = await newVisitor(browser);
  await logIn(page, PAT.email, PAT.password);
  const response = await page.request.get("/api/account/export");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("attachment");
  const text = await response.text();
  const data = JSON.parse(text);
  expect(data.account.email).toBe(PAT.email);
  expect(data.comments.map((c: { body: string }) => c.body)).toContain("Lovely first post!");
  expect(text).not.toMatch(/passwordHash|scrypt\$|owner@example\.test/);
  const loggedOut = await (await context.browser()!.newContext()).request.get("/api/account/export");
  expect(loggedOut.status()).toBe(401);
  await context.close();
});

test("deleting your account removes it and signs you out", async ({ browser }) => {
  const { context, page } = await newVisitor(browser);
  await logIn(page, PAT.email, PAT.password);
  await page.goto("/settings/account");
  await page.getByText("I want to delete my account").click();
  await page.locator('details input[name="password"]').fill(PAT.password);
  await page.locator('details input[name="confirm"]').check();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/notice=/);
  await expect(page.getByText("Your account has been deleted")).toBeVisible();

  await logIn(page, PAT.email, PAT.password);
  await expect(page).toHaveURL(/error=/);
  expect((await page.request.get("/api/account/export")).status()).toBe(401);
  await page.goto(POST_PATH);
  await expect(page.getByText("Lovely first post!")).toHaveCount(0);
  await context.close();
});

test("the owner cannot delete the site by deleting their account", async ({ browser }) => {
  const { context, page } = await newVisitor(browser);
  await logIn(page, OWNER.email, OWNER.password);
  await page.goto("/settings/account");
  await expect(page.getByText(/can.t be done from here/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete my account" })).toHaveCount(0);
  await context.close();
});
