import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const MAIL_API = process.env.E2E_MAIL_API ?? "http://localhost:8025";
export const SETUP_TOKEN = "e2e-setup-token";
export const OWNER = { name: "Owner Person", email: "owner@example.test", password: "owner-password-123" };

type MailSummary = { ID: string; Subject: string; To: { Address: string }[] };

export async function clearMailbox() {
  await fetch(`${MAIL_API}/api/v1/messages`, { method: "DELETE" });
}

async function messages(): Promise<MailSummary[]> {
  const response = await fetch(`${MAIL_API}/api/v1/messages`);
  return ((await response.json()) as { messages?: MailSummary[] }).messages ?? [];
}

// Waits for an email to this address whose subject contains the text, and returns its id and plain text.
export async function waitForMail(to: string, subject: string, timeoutMs = 30_000): Promise<{ id: string; text: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = (await messages()).find((message) => message.To.some((entry) => entry.Address === to) && message.Subject.includes(subject));
    if (match) {
      const full = (await (await fetch(`${MAIL_API}/api/v1/message/${match.ID}`)).json()) as { Text: string };
      return { id: match.ID, text: full.Text };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`No email to ${to} with "${subject}" in the subject arrived within ${timeoutMs / 1000}s.`);
}

// True if any email to this address arrives within the time. Used to show that something was NOT sent.
export async function mailArrives(to: string, subject: string, withinMs: number): Promise<boolean> {
  return waitForMail(to, subject, withinMs).then(
    () => true,
    () => false,
  );
}

export async function mailHeaders(id: string): Promise<Record<string, string[]>> {
  return (await (await fetch(`${MAIL_API}/api/v1/message/${id}/headers`)).json()) as Record<string, string[]>;
}

export function linkIn(text: string, pathPart: string): string {
  const match = text.match(new RegExp(`https?://[^\\s<>"]*${pathPart}[^\\s<>"]*`));
  if (!match) throw new Error(`No link containing ${pathPart} in the email:\n${text}`);
  return match[0].replace(/[.,)]+$/, "");
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login") || url.search.includes("error"));
}

export async function logInOwner(page: Page) {
  await logIn(page, OWNER.email, OWNER.password);
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function newVisitor(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

// Writes a post as the signed-in owner. when: "now", "draft" or a datetime-local value for a scheduled post.
export async function writePost(page: Page, title: string, body: string, when: "now" | "draft" | string = "now") {
  await page.goto("/dashboard/posts/new");
  await page.fill('input[name="title"]', title);
  await page.locator("textarea").first().fill(body);
  if (when === "draft") {
    await page.getByLabel(/Save as a draft/).check();
    await page.getByRole("button", { name: "Save draft" }).click();
  } else if (when === "now") {
    await page.getByLabel(/Publish now/).check();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
  } else {
    await page.getByLabel(/Schedule for later/).check();
    await page.getByLabel("Publish date and time").fill(when);
    await page.getByRole("button", { name: "Schedule post" }).click();
  }
  await page.waitForURL("**/dashboard/posts**");
}

// A time a month from now, in the format a datetime-local box wants, in the browser's own time zone.
export async function aMonthFromNow(page: Page): Promise<string> {
  return page.evaluate(() => {
    const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  });
}

// Signs a new member up through the whole email flow and leaves them signed in.
export async function signUpMember(
  page: Page,
  member: { name: string; email: string; password: string; emailPosts?: boolean },
) {
  await clearMailbox();
  await page.goto("/signup");
  await page.fill('input[name="name"]', member.name);
  await page.fill('input[name="email"]', member.email);
  if (member.emailPosts) await page.locator('input[name="emailPosts"]').check();
  await page.getByRole("button", { name: "Send me the link" }).click();
  await expect(page).toHaveURL(/\/signup\/check-email/);
  const mail = await waitForMail(member.email, "Finish signing up");
  await page.goto(linkIn(mail.text, "/signup/finish/"));
  await page.fill('input[name="password"]', member.password);
  await page.fill('input[name="confirm"]', member.password);
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page).toHaveURL(/\/\?notice=/);
}

export async function visitorGet(request: APIRequestContext, path: string, maxRedirects = 5) {
  return request.get(path, { maxRedirects });
}
