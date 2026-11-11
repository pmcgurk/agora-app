# Deploying Agora

Agora is one container plus the two services it stores everything in. It does not care who hosts it. This page
says what it needs, then shows three ways to run it. Pick whichever fits where you already are.

- **[One server with Docker Compose and Caddy](#option-1-one-server-with-docker-compose-and-caddy)**: any VPS or
  home machine. Everything on one box, HTTPS handled for you. This is the least moving parts.
- **[Any container platform](#option-2-a-container-platform)**: Fly.io, Railway, Render, Coolify, Kubernetes, ECS.
  Use their managed Postgres and a storage bucket.
- **[Render](deploy-render.md)**: a step by step version of option 2 for Render, with a ready-made blueprint.

## What Agora needs

| Needs | Details |
|---|---|
| **One container** | Built from the repo's [`Dockerfile`](../Dockerfile). On start it makes sure the bucket exists, applies database migrations, then listens on port 3000. It includes `ffmpeg`, which cuts free video previews. |
| **Postgres** | Any recent version (the Compose files use 18). |
| **S3-compatible storage** | MinIO (the Compose files include it), or a hosted bucket: Cloudflare R2, Backblaze B2, AWS S3, Wasabi. Browsers load and upload files straight from it with short-lived signed links, so its address must be reachable from the internet. |
| **HTTPS in front** | A reverse proxy or the platform's own. It must set `X-Forwarded-For`; the sign-in and sign-up rate limits rely on it. |
| **A single instance** | Agora keeps rate-limit counts in memory and runs a timer that publishes scheduled posts. Run one copy, on a normal long-lived server, not a serverless platform that stops between requests. |
| **A domain of its own** | `blog.example.com`, not `example.com/blog`. The app links to root paths such as `/api/media/…`. To keep a short address, make `example.com/blog` redirect to the subdomain. |

Nothing is kept on the container's disk, so you can replace the container at any time. The site is the database and
the bucket: see [Backups](backups.md).

## Settings

All settings are environment variables. Required ones are marked.

| Variable | Meaning |
|---|---|
| `DATABASE_URL` **required** | `postgresql://user:password@host:5432/agora?schema=public` |
| `NEXT_PUBLIC_BASE_URL` **required** | The address people use, with `https://` and no trailing slash. Links, emails and the sign-in cookie depend on it. With `https://` the cookie is marked Secure and HSTS is sent. |
| `MINIO_ENDPOINT` **required** | How the app reaches storage, for example `http://minio:9000` or `https://<account>.r2.cloudflarestorage.com`. |
| `MINIO_PUBLIC_ENDPOINT` | How browsers reach storage (signed links are made for this address). Same as above if storage is hosted; a public name if it is MinIO on your own server. Defaults to `MINIO_ENDPOINT`. |
| `MINIO_BUCKET`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` **required** | The bucket and its access key and secret. The names say MinIO, but they mean "bucket, access key, secret" for any S3-compatible service. |
| `MINIO_REGION` | `us-east-1` by default; `auto` for R2. |
| `APP_SECRET` **set it on any real site** | Encrypts the Stripe keys and SMTP password you save in Settings before they reach the database. A long random value (`openssl rand -hex 32`). Keep it with your other secrets: if it is lost or changed, saved keys cannot be read and must be entered again, and a restored backup needs the same value. Without it they are stored in plain text. |
| `SETUP_TOKEN` **set it on any public server** | Setup (`/setup`) also asks for this. Without it, whoever opens the page first becomes the owner. Generate one with `openssl rand -hex 24`. |
| `ALLOW_FREE_SUBSCRIPTIONS` | `true` makes paid tiers "buy" for free (a test checkout). Keep it `false` on a real site without Stripe. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Optional; or enter them in Settings → Payments. See [Payments with Stripe](../README.md#payments-with-stripe). |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`, `MAIL_SECURE` | Optional SMTP settings; or enter them in Settings → Email. With email set up, password resets and email confirmation work (see [below](#email-and-password-resets)). |
| `MAX_UPLOAD_MB` | Largest single upload (default 5120). |
| `DEMO_MODE`, `DEMO_RESET_MINUTES`, `WAITLIST_EMAIL` | **Only for a public demo. `DEMO_MODE` wipes the database.** Never set it on a real site. See [the demo](deploy-render.md#the-public-demo). |

The container refuses to start with the well-known development passwords once `NEXT_PUBLIC_BASE_URL` is `https://`.

## Option 1: one server with Docker Compose and Caddy

You need a server with Docker and ports 80 and 443 open, and two DNS records pointing at it: one for the site
(`blog.example.com`) and one for the file storage (`media.example.com`). Caddy gets and renews HTTPS certificates
for both on its own.

```sh
git clone https://github.com/pmcgurk/agora-app.git
cd agora-app
cp .env.production.example .env      # fill it in: the two domains, and three secrets (openssl rand -hex 24)
docker compose -f docker-compose.prod.yml up -d
```

[`docker-compose.prod.yml`](../docker-compose.prod.yml) runs Caddy, Postgres, MinIO and the app. Only Caddy publishes
ports: Postgres and the app stay on the private network. [`Caddyfile`](../Caddyfile) sends the site name to the app and
the media name to MinIO. The first start builds the image and takes a few minutes.

Then open `https://blog.example.com/setup`, enter your `SETUP_TOKEN`, and create your account.

To update: `git pull && docker compose -f docker-compose.prod.yml up -d --build`. Migrations run on start.

To back up: `docker compose -f docker-compose.prod.yml run --rm backup`, scheduled with cron. See [Backups](backups.md).

## Option 2: a container platform

Any platform that runs a Docker image and gives you Postgres and a bucket will do. In outline:

1. **Storage:** create a private bucket at an S3-compatible provider (R2 is cheap and has no egress fees). Make an access
   key limited to that bucket with read and write. Add a CORS rule that lets your site's origin `PUT` and `GET`
   (R2's rule format is in the [Render guide](deploy-render.md#1-create-the-storage-bucket-cloudflare-r2)). Set
   `MINIO_ENDPOINT` and `MINIO_PUBLIC_ENDPOINT` to the provider's endpoint.
2. **Database:** create a managed Postgres and set `DATABASE_URL`. Choose a plan with backups and no expiry.
3. **App:** deploy the repo's `Dockerfile` as one always-on instance listening on port 3000, with a health check on
   `/api/health`. Set the variables above, including `NEXT_PUBLIC_BASE_URL` and `SETUP_TOKEN`.
4. **Domain:** add your domain to the service and wait for the platform's certificate.
5. Open `/setup`, enter the token and create your account.

Check the platform does not run more than one instance and does not put the container to sleep.

## Option 3: without Docker

Possible, but you lose the start-up checks, so it is not recommended. Install Node 22 and `ffmpeg`, then
`npm ci`, `npm run build`, `npx prisma migrate deploy` and `npx next start`, with the same environment variables. Create
the bucket yourself first. **Set `NEXT_PUBLIC_BASE_URL` when you run `npm run build` too**: Next.js bakes it into the build, so a
build made next to a `.env` with another address would put that address in your emails and links.

## Email and password resets

Without email, nobody can be sent a reset or confirmation link, so Agora does not ask for them: new accounts start
confirmed and the "forgot password" page explains how to get help. The owner can always get a one-hour reset link from
the server:

```sh
docker compose exec app npx tsx prisma/reset-link.ts you@example.com     # Compose
npm run reset-link -- you@example.com                                     # a plain checkout
```

With email set up:

- signing up sends a link and the account is made when its owner opens it and chooses a password (so the form never reveals
  who is registered);
- "forgot password" sends a single-use link that expires after an hour;
- members can change their email address (confirmed at the new one) and ask for new posts by email, with a one-click
  unsubscribe in every message. A timer inside the server sends 50 a minute;
- creators choose whether a new post goes out as a short taste or the whole post, the name it appears to come from and an
  optional reply-to address (Settings > Newsletter), and can send themselves a test. Every email goes out from the site's own
  sending address (`MAIL_FROM`); a creator only changes the name next to it.

Use a mail provider that allows this kind of mail from your sending domain, set up SPF and DKIM for it, and keep an eye on
its logs: the site records failures but does not yet show them.

## Checklist before you announce it

- [ ] `NEXT_PUBLIC_BASE_URL` is the real `https://` address and `SETUP_TOKEN` is set.
- [ ] You created your account, and the passwords and keys in `.env` are long and random.
- [ ] `https://<site>/api/health` returns `{"status":"ok"}`.
- [ ] You posted a picture and it loads (this proves the storage address, CORS and signed links).
- [ ] [Backups](backups.md) run on a schedule, a copy is kept somewhere else, and you ran the restore drill once.
- [ ] Email is configured if you want password resets, sign-up links and new-post emails.
- [ ] `APP_SECRET` is set, so saved Stripe and SMTP keys are encrypted.
- [ ] The footer shows the version you expect (it is also in `/api/health`).
- [ ] Stripe is in live mode with a webhook pointing at `/api/stripe/webhook`, if you take payments; otherwise
      `ALLOW_FREE_SUBSCRIPTIONS` is `false`.
- [ ] `https://<site>/feed.xml` and `/sitemap.xml` load, and a shared post link shows a preview.
