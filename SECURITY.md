# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/pmcgurk/agora-app/security/advisories/new)
for this repository. Include steps to reproduce and the version or commit you tested.
You should get a reply within a few days.

## Hardening checklist for operators

See [Deploying Agora](docs/deploying.md) for the full list. The important ones:

- **Set `SETUP_TOKEN`** on any server that is reachable from the internet. Without it, whoever opens `/setup` first
  becomes the owner of the site. Create your account straight away either way.
- Change `POSTGRES_PASSWORD`, `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`; the container
  refuses to start on an `https://` base URL with the development defaults.
- Serve Agora and the file storage over HTTPS and set `NEXT_PUBLIC_BASE_URL` / `MINIO_PUBLIC_ENDPOINT`
  to those public URLs. Do not publish MinIO's console (port 9001).
- Put Agora behind a reverse proxy that sets `X-Forwarded-For` (Caddy, nginx, Traefik and every hosting platform do).
  The sign-in and sign-up rate limits use it. Behind a CDN or another proxy in front of yours, all visitors can look
  like one address to the limiter, so rate limit at the CDN too.
- Keep `SEED_DEMO_DATA=false`, never set `DEMO_MODE` (it wipes the database), and, without Stripe,
  `ALLOW_FREE_SUBSCRIPTIONS=false`.
- Set `STRIPE_WEBHOOK_SECRET`; webhook requests without a valid signature are rejected.
- Set up [backups](docs/backups.md), keep a copy off the server, and run the restore drill. Backups contain
  everything, including password hashes and the keys saved in Settings: treat them like a password file.
- Run a single instance (rate-limit counts and the scheduled-post timer live in the process).

## What Agora does

- **Passwords** are hashed with scrypt, with a per-password salt. Sign-in takes the same time whether or not the
  account exists, and sessions are random tokens stored hashed. Changing or resetting a password signs every other
  device out. Expired sessions are cleared out hourly.
- **Password reset and email confirmation** links are single-use, expire (an hour and three days), are stored only as
  hashes, and are shown behind a button so mail scanners cannot use them up. Asking for a reset gives the same answer
  whether or not the address has an account.
- **First-run setup** is locked by `SETUP_TOKEN` and creates the owner under a database lock, so two requests at once
  cannot both become the owner.
- **Content Security Policy** allows scripts only with a one-time nonce per request (`strict-dynamic`), so injected
  markup, inline event handlers and `javascript:` links do not run even if they got past escaping. Pages cannot be
  framed, uploads are limited to an allowlist of types, and anything else is served as a forced download.
- **Post text** is rendered to elements, never raw HTML. Links get `nofollow ugc`, pictures may only come from this
  site's own media endpoint, and video embeds are limited to YouTube, Vimeo, Loom and Spotify, built from a parsed id.
- **Access control**: members-only posts and files are checked on every request (`canView`). Drafts and scheduled
  posts are visible only to their creator and never reach feeds, search, previews, the media endpoint, the sitemap or
  the RSS feed. Search never matches the text of a post the searcher cannot open.
- **Media** is never stored in PostgreSQL. Gated images are served by short-lived presigned URLs after an access check;
  gated video and audio are streamed through the app.
- **API keys** are stored hashed. **Outgoing webhooks** are signed (HMAC-SHA256) and may only call public addresses by
  default: the address a creator types (and what its name resolves to) is checked, so a webhook cannot be used to reach
  the database, the storage service or a cloud metadata endpoint. Set `WEBHOOK_ALLOW_PRIVATE=true` only if your own
  automation runs on a private network.
- **Stripe** webhooks are verified by signature, each event is processed once, and a failed one is retried.
- **Saved credentials** (the Stripe keys and the SMTP password from Settings) are encrypted with AES-256-GCM using a key
  made from `APP_SECRET`, so a copy of the database or a backup does not contain them in a usable form. Values saved
  before `APP_SECRET` was set are encrypted at the next start.
- **Sign-up** on a site that can send email creates nothing until the address's owner opens a link and chooses a password,
  and answers the same for an address that has an account and one that has not, so it cannot be used to find out who is
  registered and a stranger cannot register someone else's address.
- **Accounts**: members can change their email (confirmed at the new address, the old one is told, every device signed out),
  download their data and delete their account; deleting needs the password, cancels paid plans first and removes the
  Stripe customer record.
- **Email links** to unsubscribe use a long random secret per member and do nothing on a mere visit.
- **Dependencies** are checked in CI (`npm audit` for production dependencies) and updated through Dependabot.

## Known limits

These are understood and not yet fixed. Plan around them.

- **Rate limits are per process and in memory.** They reset when the server restarts and do not work across several
  instances. Add limits at your proxy for a busy public site.
- **`APP_SECRET` is the key to the saved credentials.** Without it set, they are stored in plain text (the Payments and Email
  pages warn about this); if it is lost or changed, they cannot be read and must be entered again. There is no key rotation
  yet, and the per-webhook signing secrets are not encrypted. Prefer restricted Stripe keys.
- **A site that cannot send email still reveals registered addresses at sign-up** (it has to say "already registered", since it
  cannot reply privately). The sign-in and reset forms never do.
- **Email change and account deletion ask for the password but not a second factor.** There is no two-factor sign-in yet.
- **Webhook addresses are checked when the webhook is saved and again on each delivery**, but a hostile DNS server
  could change its answer between the check and the connection. The private-address block is a strong guard, not a
  sandbox: do not run Agora with credentials it does not need.
- **The owner's SMTP host is not restricted**, so the owner (who already controls the server's settings) can make it
  connect to any address.
- **Styles allow inline rules** (`style-src 'unsafe-inline'`), which theming and Next.js rely on.
- **Development tooling** (ESLint and TypeScript-ESLint) has open moderate advisories. They affect developers' machines
  and CI, not the running site.
