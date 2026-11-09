# Run the Agora demo on Render

This guide puts a public demo of Agora on [Render](https://render.com) at your own domain (for example
`agora.mcgurk.dev`). Visitors can walk through the setup wizard as a new creator, browse as a supporter or as
a signed-out visitor, and join a waitlist for hosted Agora. Everything they do is wiped on a timer.

> **Demo mode deletes the database.** `DEMO_MODE=true` wipes every table (except the waitlist) when the server
> starts and every hour after. Use it only on a database made for the demo, never on a site with real people
> on it. For a real site, follow the same steps but leave `DEMO_MODE` unset and see
> [the notes at the end](#running-a-real-site-instead).

## What you need

| | Used for | Cost |
|---|---|---|
| A GitHub repo with this code | Render builds from it | free |
| A Render account | the web app and its Postgres database | free tiers exist, see [limits](#free-tier-limits) |
| S3-compatible storage | the demo's pictures (Cloudflare R2 is used below) | R2 has a free allowance |
| An SMTP account | emailing you about waitlist sign-ups (optional) | free tiers exist |
| A domain you control | `agora.mcgurk.dev` | you already have it |

Prices and plan names change, so check Render's and Cloudflare's pricing pages before you commit.

## 1. Create the storage bucket (Cloudflare R2)

Agora keeps pictures and files in S3-compatible storage. Render has none of its own, so use an outside bucket.
Any S3-compatible service works (Backblaze B2, AWS S3, Wasabi). These steps are for R2.

1. In the Cloudflare dashboard, open **R2 Object Storage** and create a bucket called `agora-demo`.
2. Open **Manage R2 API Tokens** and create a token with **Object Read & Write**, limited to that bucket.
3. Note the three values it shows you:
   - **Access Key ID** (goes in `MINIO_ROOT_USER`)
   - **Secret Access Key** (goes in `MINIO_ROOT_PASSWORD`)
   - **Endpoint**, `https://<account-id>.r2.cloudflarestorage.com` (goes in both `MINIO_ENDPOINT` and
     `MINIO_PUBLIC_ENDPOINT`)
4. Keep the bucket **private**. Agora hands browsers short-lived signed links, so nothing needs to be public.

The variables are called `MINIO_*` because Agora also runs against MinIO. They mean "S3 endpoint, bucket,
access key and secret" for any provider. Use `MINIO_REGION=auto` for R2.

The demo is read-only, so you don't need to set up browser upload rules (CORS). A real site that lets creators
upload does: allow your site's origin to `PUT` and `GET` on the bucket.

**Read-only keys.** The demo needs write access only once, to upload its sample pictures on the first start.
Afterwards, create a second R2 token with **Object Read only** for this bucket and put its key and secret in
`MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`. If the pictures are ever deleted, switch back to the read and write
key for one restart.

## 2. Get SMTP details (optional, for waitlist emails)

Waitlist sign-ups are always saved in the database. To also get an email at `paul@mcgurk.dev` for each new one,
give Agora an outgoing mail account. Any SMTP service works (Resend, Brevo, Postmark, Amazon SES...). You need
a host, port, username, password and a "from" address on a domain you have verified with that service.

If you skip this, nothing breaks. You read the list from the database instead ([step 6](#6-read-the-waitlist)).

## 3. Deploy with the blueprint

[`render.yaml`](../render.yaml) in the repo root describes the whole setup: one Docker web service and one
Postgres database.

1. Push this repo to GitHub.
2. In Render, choose **New → Blueprint**, pick the repository and branch, and continue.
3. Render lists the values the blueprint can't know. Fill them in:

   | Variable | Value |
   |---|---|
   | `MINIO_ENDPOINT` | the R2 endpoint from step 1 |
   | `MINIO_PUBLIC_ENDPOINT` | the same R2 endpoint |
   | `MINIO_BUCKET` | `agora-demo` |
   | `MINIO_ROOT_USER` | the Access Key ID |
   | `MINIO_ROOT_PASSWORD` | the Secret Access Key |
   | `MAIL_HOST`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` | from step 2, or leave blank |

   The blueprint already sets `DEMO_MODE=true`, `DEMO_RESET_MINUTES=60`, `WAITLIST_EMAIL=paul@mcgurk.dev`,
   `NEXT_PUBLIC_BASE_URL=https://agora.mcgurk.dev`, `PORT=3000` and the database connection. Change the
   address or the domain in `render.yaml` if you are not Paul.
4. Apply. The first build takes several minutes. When it is running, the logs end with `Demo data reset (startup)`.

On every start the container checks the bucket, applies database migrations, and then the app seeds Maya, the
fictional creator.

## 4. Point your domain at it

1. In the Render service, open **Settings → Custom Domains** and add `agora.mcgurk.dev`.
2. At your DNS provider add the record Render shows, normally a `CNAME` from `agora` to
   `<your-service>.onrender.com`. If the DNS is on Cloudflare, set the record to **DNS only** (grey cloud) until
   Render has issued the certificate.
3. Wait for Render to verify the domain and issue the HTTPS certificate. It is automatic.

`NEXT_PUBLIC_BASE_URL` must match the final address, with `https://`, or links and cookies will be wrong.

## 5. Check it works

- `https://agora.mcgurk.dev/api/health` returns `{"status":"ok"}`.
- `https://agora.mcgurk.dev/` shows Maya's page with the blue demo banner and nine posts.
- `https://agora.mcgurk.dev/demo` offers the three views. Walk the setup wizard through to the dashboard.
- Pictures load. If they are broken, the storage values are wrong ([troubleshooting](#troubleshooting)).
- Join the waitlist with your own address. A message should reach `paul@mcgurk.dev` (if you set up SMTP), and the
  row should appear in the database.

## 6. Read the waitlist

Entries live in the `WaitlistEntry` table and survive every reset.

In the Render dashboard open the database, copy the **External Database URL** and run:

```sh
psql "<external database url>" -c 'select email, "createdAt" from "WaitlistEntry" order by "createdAt"'
```

For a CSV: `psql "<url>" -c '\copy (select email, "createdAt" from "WaitlistEntry" order by "createdAt") to waitlist.csv csv header'`.

To remove someone who asks: `delete from "WaitlistEntry" where email = 'them@example.com';`.

You are collecting personal data, so keep the list private, use it only to announce hosted Agora (as the form
promises), and delete entries on request.

## How the demo behaves

- **Resets.** When the server starts and every `DEMO_RESET_MINUTES` (default 60) it deletes everything and
  re-seeds Maya, her tiers, nine posts, two supporters and some analytics. Visitors who are signed in are signed
  out and the page-view counters start again. The waitlist is kept.
- **Setup wizard.** `/setup` and `/onboarding` can be replayed any number of times. The wizard checks what you
  type like the real thing but saves nothing, and the Stripe step shows the full tutorial with pre-filled
  fake keys.
- **Read-only.** Visitors can look at everything but cannot change anything: posting, editing, commenting,
  liking, messaging, tipping, subscribing, uploading, sign-up and every settings change are refused. A banner
  explains why when they try. Stripe is never contacted, whatever keys are configured.
- **What can still be written.** Only the sign-in sessions that the three views create, page-view counters, and
  waitlist entries. The setup wizard saves nothing.
- **Storage is written only by the seed.** The demo uploads its sample pictures to the bucket the first time it
  starts and skips any that are already there, so after the first successful start you can swap the storage
  keys for read-only ones ([step 1](#1-create-the-storage-bucket-cloudflare-r2)).
- **Search engines.** The demo sends `noindex` headers and a robots meta tag.

## Free tier limits

At the time of writing Render's free web services sleep after a period without traffic and take a while to wake,
and free Postgres databases are time-limited. Check the current terms. What that means for a demo:

- The first visitor after a quiet spell waits while the container starts. Because every start re-seeds the demo,
  a woken demo is always fresh.
- If the free database expires, create a new one and update `DATABASE_URL`, or move to a paid database.
- A paid web instance stays awake. That is the single biggest improvement for a demo people are meant to try.

## Updating

Render redeploys when you push to the branch it follows. Migrations run on start. A deploy restarts the
container, which also resets the demo.

## Troubleshooting

- **Deploy fails with `Refusing to start`.** The URL is `https://` but the storage or database password is one of
  the development defaults. Set real values.
- **502 or "no open ports".** The app listens on 3000. Make sure the `PORT` variable is `3000`.
- **`MinIO did not become ready`.** `MINIO_ENDPOINT` is wrong or unreachable. Use the full `https://` endpoint.
- **Pictures are broken.** `MINIO_PUBLIC_ENDPOINT` must be an address browsers can reach, and it must be the
  same endpoint the keys belong to (the link signature includes the host). The keys need read and write on the bucket.
- **Waitlist email never arrives.** Open the service logs and look for `Sending email failed`. Check the SMTP
  host, port (587 with STARTTLS, or 465 with `MAIL_SECURE=true`), password and that `MAIL_FROM` is on a domain
  verified with your mail provider. The sign-up is saved either way.
- **The demo shows the setup screen forever.** The seed failed. Look in the logs for `Demo reset failed` and fix
  the cause (usually storage credentials).

## Running a real site instead

The same blueprint runs a normal Agora site if you:

1. delete the `DEMO_MODE`, `DEMO_RESET_MINUTES` and `WAITLIST_EMAIL` lines;
2. use a paid database that is not time-limited, and take backups;
3. set your own Stripe keys in the dashboard or as environment variables (see the README);
4. open the site yourself first, because the first account to sign up becomes the creator.

Never turn `DEMO_MODE` on for a database with real data. It is designed to erase it.
