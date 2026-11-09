# Run Agora on Render

This guide puts a real Agora site on [Render](https://render.com) at your own domain, for example
`blog.example.com`. It uses one Docker web service, one Postgres database and an outside S3-compatible bucket
for pictures and files. The blueprint is [`render.yaml`](../render.yaml). If you want a public, read-only
showcase instead, see [the public demo](#the-public-demo) at the end.

Prices and plan names change, so check Render's and your storage provider's pricing pages as you go.

## What you need

| | Used for |
|---|---|
| A GitHub repo with this code (a fork is fine) | Render builds from it |
| A Render account | the web app and its Postgres database |
| S3-compatible storage | pictures, video and files (Cloudflare R2 is used below) |
| A domain you control | the address people visit |
| An SMTP account (optional) | emails from your site |
| A Stripe account (optional) | paid tiers and tips |

**Serve Agora from its own domain or subdomain, not a path.** `blog.example.com` works. `example.com/blog` does
not: Agora links to root paths such as `/api/media/…` and `/login`, and post text stores those paths. If you
want the short address, make `example.com/blog` redirect to the subdomain.

## 1. Create the storage bucket (Cloudflare R2)

Render has no file storage of its own, so use an outside bucket. Any S3-compatible service works (Backblaze B2,
AWS S3, Wasabi). These steps are for R2.

1. In the Cloudflare dashboard, open **R2 Object Storage** and create a bucket, for example `agora-media`. Keep it
   **private**: Agora hands browsers short-lived signed links, so nothing needs to be public.
2. Create an API token with **Object Read & Write**, limited to that bucket. Note the **Access Key ID**, the
   **Secret Access Key** and the **endpoint**, `https://<account-id>.r2.cloudflarestorage.com` (for a bucket in the
   EU jurisdiction it is `<account-id>.eu.r2.cloudflarestorage.com`).
3. Open the bucket's **Settings → CORS policy** and allow your site to upload straight from the browser:

   ```json
   [
     {
       "AllowedOrigins": ["https://blog.example.com"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Use your real address. Without this, uploading a picture or video from the post editor fails in the browser.

The Agora variables are called `MINIO_*` because it also runs against MinIO. They mean "S3 endpoint, bucket,
access key and secret" for any provider. R2 wants `MINIO_REGION=auto`, which the blueprint sets.

## 2. Deploy with the blueprint

1. Push the repo to GitHub.
2. In Render, choose **New → Blueprint**, pick the repository and branch, and continue.
3. Check the plans. [`render.yaml`](../render.yaml) asks for a small paid web instance and a small paid Postgres.
   Edit the `plan` lines first if Render's current names differ. Use a web plan that stays awake and a database
   that keeps your data.
4. Render lists the values the blueprint can't know. Fill them in:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_BASE_URL` | your address with `https://` and no trailing slash, e.g. `https://blog.example.com` |
   | `MINIO_ENDPOINT` | the R2 endpoint from step 1 |
   | `MINIO_PUBLIC_ENDPOINT` | the same endpoint |
   | `MINIO_BUCKET` | your bucket name |
   | `MINIO_ROOT_USER` | the Access Key ID |
   | `MINIO_ROOT_PASSWORD` | the Secret Access Key |

   The blueprint already sets `PORT=3000`, `MINIO_REGION=auto`, `MAX_UPLOAD_MB=1024`,
   `ALLOW_FREE_SUBSCRIPTIONS=false` and the database connection.
5. Apply. The first build takes several minutes. On every start the container checks the bucket, applies
   database migrations and starts the app.

## 3. Point your domain at it

1. In the Render service, open **Settings → Custom Domains** and add your domain.
2. At your DNS provider add the record Render shows, normally a `CNAME` from the subdomain to
   `<your-service>.onrender.com`. If your DNS is on Cloudflare, set the record to **DNS only** (grey cloud) until
   Render has issued the certificate.
3. Wait for Render to verify it and issue the HTTPS certificate. It is automatic.

`NEXT_PUBLIC_BASE_URL` must match the final address exactly, or links and sign-in cookies will be wrong.

## 4. Create your account straight away

**The first person to open the setup screen becomes the site owner.** As soon as the site is reachable, open
`https://<your address>/setup`, create your account and walk through the wizard. Do this before you share the
address or announce anything.

The wizard asks for your name, your page details and, optionally, Stripe. You can finish it later in
**Settings**.

## 5. Check it works

- `https://<your address>/api/health` returns `{"status":"ok"}`.
- Write a post with a picture. If the upload fails in the browser, the bucket's CORS policy is missing or does
  not match your address. If the picture is broken afterwards, see [troubleshooting](#troubleshooting).
- Open the site in a private window to see what visitors see.

## 6. Optional: payments and email

You can configure both inside Agora as the owner, or as environment variables on the Render service.

- **Stripe.** Follow [Payments with Stripe](../README.md#payments-with-stripe). Add a webhook in Stripe pointing
  at `https://<your address>/api/stripe/webhook`. Enter the keys in **Settings → Payments**, or set
  `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` on the service. Until you do, keep
  `ALLOW_FREE_SUBSCRIPTIONS=false`.
- **Email.** Enter an SMTP server in **Settings → Email** (the owner sees it under Advanced), or set `MAIL_HOST`,
  `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` and, for port 465, `MAIL_SECURE=true`. Any SMTP service
  works (Resend, Brevo, Postmark, Amazon SES...); `MAIL_FROM` must be an address on a domain you have verified with
  it. Use **Send test email** to check.

## Keeping it running

- **Updates.** Render redeploys when you push to the branch it follows. Migrations run on start.
- **Backups.** Your posts and members live in Postgres and your files in the bucket. Check that your database plan
  includes backups and how long they are kept, and take your own copy now and then:
  `pg_dump "<external database url>" > agora.sql`. The bucket is not backed up by Render. Copy it elsewhere if
  the pictures matter to you.
- **Secrets.** Never commit keys. Set them in the Render dashboard.

## Troubleshooting

- **Deploy fails with `Refusing to start`.** The URL is `https://` but a password is one of the development
  defaults. Set real values.
- **502 or "no open ports".** The app listens on 3000. Make sure the `PORT` variable is `3000`.
- **`MinIO did not become ready`.** `MINIO_ENDPOINT` is wrong or unreachable. Use the full `https://` endpoint.
- **Pictures are broken.** `MINIO_PUBLIC_ENDPOINT` must be an address browsers can reach and the same endpoint the
  keys belong to, because the link signature includes the host. The keys need read and write access to the bucket.
- **Uploads fail in the browser.** Fix the bucket's CORS policy (step 1).
- **Links or sign-in go to the wrong place.** `NEXT_PUBLIC_BASE_URL` does not match the address you visit.
- **Emails never arrive.** Check the service logs for `Sending email failed`, then the host, port, password and
  verified sender domain.

---

# The public demo

[`render.demo.yaml`](../render.demo.yaml) deploys a public, read-only showcase of Agora, such as the one at
`agora.mcgurk.dev`. Visitors walk through the setup wizard as a new creator, browse as a supporter or as a
signed-out visitor, and can join a waitlist for hosted Agora.

> **Demo mode deletes the database.** `DEMO_MODE=true` wipes every table (except the waitlist) when the server
> starts and every hour after. Use it only on a database made for the demo, never on a site with real people
> on it. A real site never sets `DEMO_MODE`.

## Deploying it

Follow steps 1 to 3 above, with these differences:

- Render reads `render.yaml` by default. For the demo, either choose `render.demo.yaml` as the blueprint file if
  Render's form lets you, or keep a `demo` branch where that file has been copied over `render.yaml`, and deploy
  that branch.
- The demo does not need the CORS policy, because it is read-only.
- `render.demo.yaml` already sets `DEMO_MODE=true`, `DEMO_RESET_MINUTES=60`, `WAITLIST_EMAIL=paul@mcgurk.dev` and
  `NEXT_PUBLIC_BASE_URL=https://agora.mcgurk.dev`. Change the address and domain in the file if you are not Paul.
  It uses free plans, which have [limits](#free-tier-limits).
- Fill in the storage values as in step 2, and optionally the `MAIL_*` values for waitlist emails.
- When it is running, the logs end with `Demo data reset (startup)`.

**Read-only storage keys.** The demo writes to the bucket only once, to upload its sample pictures on the first
start. Afterwards you can create a second R2 token with **Object Read only** for the bucket and put its key and
secret in `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`. If the pictures are ever deleted, switch back to the read
and write key for one restart.

## How the demo behaves

- **Read-only.** Visitors can look at everything but cannot change anything: posting, editing, commenting,
  liking, messaging, tipping, subscribing, uploading, sign-up and every settings change are refused. A banner
  explains why when they try. Stripe is never contacted, whatever keys are configured.
- **What can still be written.** Only the sign-in sessions that the three views create, page-view counters and
  waitlist entries. The setup wizard saves nothing.
- **Resets.** When the server starts and every `DEMO_RESET_MINUTES` (default 60, minimum 5) it deletes everything
  and re-seeds Maya, the fictional creator, with her tiers, nine posts, two supporters and some analytics.
  Visitors who are signed in are signed out. The waitlist is kept.
- **Setup wizard.** `/setup` and `/onboarding` can be replayed any number of times. The wizard checks what you
  type like the real thing but saves nothing, and the Stripe step shows the full tutorial with pre-filled fake keys.
- **Search engines.** The demo sends `noindex` headers and a robots meta tag.

## The waitlist

Waitlist sign-ups are always saved in the `WaitlistEntry` table, which survives every reset. If you set up SMTP,
each new one is also emailed to `WAITLIST_EMAIL`. Without `WAITLIST_EMAIL` the form is hidden.

To read the list, copy the **External Database URL** from the Render database and run:

```sh
psql "<external database url>" -c 'select email, "createdAt" from "WaitlistEntry" order by "createdAt"'
```

For a CSV: `psql "<url>" -c '\copy (select email, "createdAt" from "WaitlistEntry" order by "createdAt") to waitlist.csv csv header'`.
To remove someone who asks: `delete from "WaitlistEntry" where email = 'them@example.com';`.

You are collecting personal data, so keep the list private, use it only to announce hosted Agora (as the form
promises), and delete entries on request.

## Free tier limits

At the time of writing Render's free web services sleep after a period without traffic and take a while to wake,
and free Postgres databases are time-limited. Check the current terms. For a demo that means:

- The first visitor after a quiet spell waits while the container starts. Because every start re-seeds the demo,
  a woken demo is always fresh.
- If the free database expires, create a new one and update `DATABASE_URL`, or move to a paid database.
- A paid web instance stays awake, which is the biggest improvement for a demo people are meant to try.

## Demo troubleshooting

- **The demo shows the setup screen forever.** The seed failed. Look in the logs for `Demo reset failed` and fix the
  cause, usually the storage credentials.
- **Waitlist email never arrives.** Look for `Sending email failed` in the logs. The sign-up is saved either way.
