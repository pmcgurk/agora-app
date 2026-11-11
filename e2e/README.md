# Browser tests

These drive a real browser through Agora: first-run setup, posting, drafts and scheduling, sign-up by email,
password reset, changing email, downloading and deleting an account, new-post emails and unsubscribing, and the
security headers. They run in CI on every push and pull request (the `e2e` job in `.github/workflows/ci.yml`).

## What they need

- **A throwaway Postgres database** whose name contains `e2e`. The tests wipe it, and refuse to touch anything else.
- **A mail catcher** (Mailpit): SMTP on port 1025 and its API on 8025.
  `docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit`
- A browser: `npx playwright install chromium`, or use the Chrome you already have with `E2E_CHANNEL=chrome`.

## Run them

```sh
export E2E_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/agora_e2e?schema=public'
npm run test:e2e
```

`npm run test:e2e` first rebuilds the empty test database, clears the mail catcher and builds the site for the
tests (Next.js bakes the site address into the build, so it has to be built for `localhost:3100`; set `E2E_SKIP_BUILD=1`
to reuse a build you made that way), then starts the built site
on port 3100 (`E2E_PORT` changes it) with the settings the tests need, and runs the files one after another in
name order. They build on each other: `01` creates the site, the rest use it.

Run one file with `npx playwright test e2e/03-accounts.spec.ts` after a full run has set the site up, or run it
all again from scratch. When a test fails, a trace is kept in `test-results/` (`npx playwright show-trace`).

## What they do not cover

Stripe (there are no keys), and file uploads (there is no storage). Those have unit tests for their logic.
