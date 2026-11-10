import { expect, test } from "@playwright/test";
import { clearMailbox, linkIn, logInOwner, mailArrives, mailHeaders, newVisitor, signUpMember, waitForMail, writePost } from "./helpers";

test.describe.configure({ mode: "serial" });

const SAM = { name: "Sam Follower", email: "sam@example.test", password: "sam-password-123", emailPosts: true };

test("a member who ticks the box and follows gets new posts by email, with an unsubscribe", async ({ browser }) => {
  const sam = await newVisitor(browser);
  await signUpMember(sam.page, SAM);
  await sam.page.goto("/");
  await sam.page.getByRole("button", { name: "Follow" }).click();
  await expect(sam.page.getByText("You follow this creator.")).toBeVisible();
  // They asked for emails at sign-up, so the strip offers to stop them.
  await expect(sam.page.getByRole("button", { name: "Stop emailing me new posts" })).toBeVisible();

  const owner = await newVisitor(browser);
  await logInOwner(owner.page);
  await clearMailbox();
  await writePost(owner.page, "Fresh news", "Something happened **today**.");

  const mail = await waitForMail(SAM.email, "New post: Fresh news");
  expect(mail.text).toContain("Something happened today.");
  expect(mail.text).toContain("/posts/fresh-news");
  const headers = await mailHeaders(mail.id);
  expect(headers["List-Unsubscribe"]?.[0]).toMatch(/\/api\/unsubscribe\/[0-9a-f]{64}>/);
  expect(headers["List-Unsubscribe-Post"]?.[0]).toBe("List-Unsubscribe=One-Click");

  // The unsubscribe page shows a button and does nothing on a mere visit (link scanners open every link).
  const unsubscribeLink = linkIn(mail.text, "/unsubscribe/");
  const visitor = await newVisitor(browser);
  await visitor.page.goto(unsubscribeLink);
  await expect(visitor.page.getByRole("button", { name: "Unsubscribe" })).toBeVisible();
  await visitor.page.goto("/");
  await sam.page.goto("/");
  await expect(sam.page.getByRole("button", { name: "Stop emailing me new posts" })).toBeVisible();

  await visitor.page.goto(unsubscribeLink);
  await visitor.page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(visitor.page.getByText("You won't get emails about new posts any more")).toBeVisible();

  // No more emails, though they still follow.
  await clearMailbox();
  await writePost(owner.page, "Second post", "More news.");
  expect(await mailArrives(SAM.email, "New post: Second post", 8_000)).toBe(false);
  await sam.page.goto("/");
  await expect(sam.page.getByText("You follow this creator.")).toBeVisible();
  await expect(sam.page.getByRole("button", { name: "Email me new posts" })).toBeVisible();

  await sam.context.close();
  await owner.context.close();
  await visitor.context.close();
});

test("they can switch it back on from the page, and the one-click unsubscribe from the mail program works", async ({ browser }) => {
  const sam = await newVisitor(browser);
  await sam.page.goto("/login");
  await sam.page.fill('input[name="email"]', SAM.email);
  await sam.page.fill('input[name="password"]', SAM.password);
  await sam.page.getByRole("button", { name: "Log in" }).click();
  await sam.page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await sam.page.goto("/");
  await sam.page.getByRole("button", { name: "Email me new posts" }).click();
  await expect(sam.page.getByText("You'll get new posts by email.")).toBeVisible();

  const owner = await newVisitor(browser);
  await logInOwner(owner.page);
  await clearMailbox();
  await writePost(owner.page, "Third post", "Back again.");
  const mail = await waitForMail(SAM.email, "New post: Third post");
  const oneClick = (await mailHeaders(mail.id))["List-Unsubscribe"][0].replace(/^<|>$/g, "");

  // A mail program POSTs to this address with no login and no cookies.
  const response = await owner.page.request.post(oneClick, { data: "List-Unsubscribe=One-Click", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  expect(response.status()).toBe(200);
  await clearMailbox();
  await writePost(owner.page, "Fourth post", "Silence.");
  expect(await mailArrives(SAM.email, "New post: Fourth post", 8_000)).toBe(false);

  expect((await owner.page.request.post("/api/unsubscribe/" + "0".repeat(64))).status()).toBe(404);
  await sam.context.close();
  await owner.context.close();
});

test("the owner sees how many members get posts by email", async ({ browser }) => {
  const sam = await newVisitor(browser);
  await sam.page.goto("/login");
  await sam.page.fill('input[name="email"]', SAM.email);
  await sam.page.fill('input[name="password"]', SAM.password);
  await sam.page.getByRole("button", { name: "Log in" }).click();
  await sam.page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await sam.page.goto("/settings/notifications");
  await sam.page.getByLabel(/Email me when someone I follow publishes/).check();
  await sam.page.getByRole("button", { name: "Save" }).click();

  const owner = await newVisitor(browser);
  await logInOwner(owner.page);
  await owner.page.goto("/dashboard");
  await expect(owner.page.locator("dl > div", { hasText: "Get posts by email" })).toContainText("1");
  await sam.context.close();
  await owner.context.close();
});
