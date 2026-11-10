import { expect, test } from "@playwright/test";
import { aMonthFromNow, logInOwner, writePost } from "./helpers";

test.describe.configure({ mode: "serial" });

const PUBLIC_TITLE = "Hello World - Hello Agora";
const PUBLIC_SLUG = "hello-world-hello-agora";
const PORT = process.env.E2E_PORT ?? "3100";

test("the owner publishes a post, saves a draft and schedules another", async ({ page }) => {
  await logInOwner(page);
  await writePost(page, PUBLIC_TITLE, "This is my **first** post, powered by Agora.");
  await expect(page.locator('main [role="status"]').first()).toContainText("Post published");
  await writePost(page, "Secret plans", "Draft text nobody should see.", "draft");
  await expect(page.locator('main [role="status"]').first()).toContainText("Draft saved");
  await writePost(page, "Coming later", "Scheduled text.", await aMonthFromNow(page));
  await expect(page.locator('main [role="status"]').first()).toContainText("Post scheduled");

  // The Posts list, the sidebar and the owner's own page all show what is not live yet.
  await expect(page.getByRole("heading", { name: /Drafts/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Scheduled/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Posts/ })).toContainText("2");
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Your drafts and scheduled posts" })).toContainText("Secret plans");
});

test("a visitor sees only what is live", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("article h2")).toHaveText([PUBLIC_TITLE]);
  await expect(page.getByRole("region", { name: "Your drafts and scheduled posts" })).toHaveCount(0);
  await expect((await context.request.get("/posts/secret-plans")).status()).toBe(404);
  await expect((await context.request.get("/posts/coming-later")).status()).toBe(404);
  await context.close();
});

test("drafts and scheduled posts stay out of the feed, sitemap and search", async ({ request }) => {
  const feed = await request.get("/feed.xml");
  expect(feed.headers()["content-type"]).toContain("application/rss+xml");
  const xml = await feed.text();
  expect(xml).toContain(`<title>${PUBLIC_TITLE}</title>`);
  expect(xml).toContain(`/posts/${PUBLIC_SLUG}`);
  expect(xml).not.toMatch(/Secret plans|Coming later/);

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`/posts/${PUBLIC_SLUG}`);
  expect(sitemap).not.toMatch(/secret-plans|coming-later/);

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /dashboard");
  expect(robots).toContain("Sitemap:");
});

test("posts have readable addresses and the old ones redirect", async ({ page, request }) => {
  await logInOwner(page);
  await page.goto("/dashboard/posts");
  const editLink = await page.locator(`li:has-text("${PUBLIC_TITLE}") a[href*="/edit"]`).getAttribute("href");
  const postId = editLink!.split("/")[3];
  const byId = await request.get(`/posts/${postId}`, { maxRedirects: 0 });
  expect(byId.status()).toBe(308);
  expect(byId.headers().location).toContain(`/posts/${PUBLIC_SLUG}`);
});

test("a public post carries a link preview, and its feed link", async ({ request }) => {
  const html = await (await request.get(`/posts/${PUBLIC_SLUG}`)).text();
  expect(html).toContain(`<meta property="og:title" content="${PUBLIC_TITLE}"`);
  expect(html).toContain('<meta property="og:type" content="article"');
  expect(html).toMatch(/<meta name="description" content="This is my first post, powered by Agora\./);
  expect(html).toContain(`<link rel="canonical" href="http://localhost:${PORT}/posts/${PUBLIC_SLUG}"`);
  expect(html).toContain("application/rss+xml");
});

test("the footer and the health check say which version is running", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator(".agora-version")).toHaveText(/^v\d+\.\d+\.\d+/);
  const health = await (await request.get("/api/health")).json();
  expect(health.status).toBe("ok");
  expect(health.version).toMatch(/^v\d+\.\d+\.\d+/);
});
