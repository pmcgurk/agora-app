# Agora

Agora is an open-source, self-hosted platform for creators to publish work and
build direct relationships with their supporters. It aims to be a decentralized
alternative to Patreon, Ko-fi, or similar creator-fan platforms with control over hosting, data,
and presentation kept in the hands of each creator.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS
- Prisma ORM and PostgreSQL 18
- MinIO for S3-compatible media storage
- Docker Compose for self-hosted deployment

## Quick start

```sh
git clone https://github.com/pmcgurk/agora.git
cd agora
docker compose up -d
```

That single command builds the app, starts PostgreSQL and MinIO, creates the
private media bucket, applies database migrations, and starts Agora at
<http://localhost:3000>. Data lives in the `postgres_data` and `minio_data`
Docker volumes. The first start builds the image and takes a few minutes.

To try it with demo data, run `SEED_DEMO_DATA=true docker compose up -d` and log
in as `demo@agora.local` (creator) or `patron@agora.local` (patron) with the
password `demo-password`. Never seed a public instance.

## Configuration

`docker compose up` runs with development defaults. For anything beyond your own
machine, copy `.env.example` to `.env` and:

- MinIO's official Docker Hub images were removed, so the default image is the
  community fork `pgsty/minio` (override with `MINIO_IMAGE`). The app creates
  the media bucket on startup;
- change `POSTGRES_PASSWORD`, `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`;
- set `NEXT_PUBLIC_BASE_URL` and `MINIO_PUBLIC_ENDPOINT` to the URLs browsers
  use (use `https://`; presigned media links are signed for the MinIO URL);
- **create your creator account first.** The first account to sign up on a fresh
  instance becomes the creator, so do this before sharing the URL;
- for real payments set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (see
  [Payments with Stripe](#payments-with-stripe)). Without a Stripe key, set
  `ALLOW_FREE_SUBSCRIPTIONS=false` on a public instance (it enables a test checkout
  that takes no payment);
- put Agora behind an HTTPS reverse proxy. With an `https://` `NEXT_PUBLIC_BASE_URL`
  the container refuses to start with the default development passwords, and
  MinIO's admin console (port 9001) is only published on `127.0.0.1`.

## Payments with Stripe

1. Create a Stripe account and copy a secret key (`sk_test_...` while trying it out).
2. In Stripe → Developers → Webhooks add the endpoint
   `<NEXT_PUBLIC_BASE_URL>/api/stripe/webhook` with the events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`
   and `charge.refunded`.
3. Put the key and the endpoint's signing secret in `.env` as `STRIPE_SECRET_KEY` and
   `STRIPE_WEBHOOK_SECRET`, then `docker compose up -d`.
4. For local testing use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
5. Enable the customer portal in Stripe settings so patrons can update cards and see invoices.

Agora creates a Stripe Product/Price for each paid tier on first use (and a new
Price when you change the amount or currency), sends patrons to Stripe Checkout,
and keeps plans in sync from webhooks. Ending a paid plan keeps access until the end of
the paid period; refunds issued from the Members page are real Stripe refunds. Card
data never touches Agora. The Stripe integration has been exercised against a mock
Stripe API, not a live account, so test it in Stripe test mode before going live.

## What works today

- Email and password accounts (creator or patron) with server-side sessions.
- Every creator gets a free "Follower" tier, so visitors can simply follow them.
  Creators add paid tiers on top.
- Posts take multiple photos, videos and audio files. Files upload straight from
  the browser to MinIO (drag and drop, progress, reorder), so large videos work;
  the cap is `MAX_UPLOAD_MB` (default 5 GB). Media never goes into PostgreSQL.
- Posts can be public or limited to a tier and above. Gated media is only served
  after an access check on every request: images through a 60-second presigned URL,
  video and audio streamed through the app (so a copied link can't be shared).
- Teasers for gated posts: viewers can "show blurred image" (made server-side from
  a tiny copy, so it can't be un-blurred) or watch the first N seconds of a video
  (a separate clip cut with ffmpeg, included in the Docker image).
- Creators can gift a tier to a patron (optionally expiring) and see stats:
  members per tier, gifted members, estimated monthly revenue and storage used.
- Posts can be edited and deleted (with confirmation). Locked videos show a thumbnail
  (blurred unless the creator chooses otherwise).
- One active plan per patron: choosing a tier replaces the previous one. The first
  account created on a fresh instance becomes the creator.
- Feed posts play video inline, expand images in a lightbox and show a clear
  "1 / N" badge when a post has several files.
- Pick body and heading fonts from a short Google Fonts list in Settings → Appearance
  (fonts load from Google at runtime).
- Block users, refund payments, and optional direct messages from patrons (toggle in
  Settings -> Privacy), which can be limited to members of a chosen tier and above.
- Profile pictures for everyone and a banner for the creator (Settings -> Profile).
  Uploads are re-encoded server-side (metadata stripped) and stored in MinIO.
- Supporters can end their plan; paid plans keep working until the period they paid for ends.
- Ko-fi style tips: creators switch on one-off tips in Settings -> Monetization. A "Support
  <creator>" card sits at the top of the creator's page (the home page on a
  single-creator instance), with a "Tip" link in the header and the same card on the Support
  page. Anyone can tip: guests need no account, and the optional name field (blank = shown as
  Anonymous) and message are all the creator sees. Tips go through Stripe Checkout
  (`mode: "payment"`; guests enter their email there for the receipt), show up under Payments on
  the Members page (refundable), notify the creator and fire the `tip.received` webhook.
  Guest tipping is rate limited per IP and unavailable on private instances.
  With no Stripe key and `ALLOW_FREE_SUBSCRIPTIONS=true`, tips are recorded without taking money.
- Public REST API with API keys and signed webhooks for every notification type (new posts,
  comments, likes, members, refunds, blocks, messages). Docs are in Settings -> API docs.
- On a single-creator instance the feed is the home page (`/`).
- Likes (from the feed too, and on comments) and comments on posts, visible to people who can see the post.
- One creator per instance for now: the site is themed with the creator's theme, their
  name replaces "Agora" in the header, and visitors land on their page.
- Creator dashboard with Overview, Posts, Members, Tiers and Analytics sections, and a
  "New post" button in the header. Settings cover profile, appearance, currency, privacy
  and account; patrons get their own subscriptions and account settings.
- Themes: light, dark and classic presets, or upload a JSON file with colors, radius,
  fonts and custom CSS targeting `agora-*` classes. Creators can hide the
  "Powered by Agora" footer.
- Private instances: only signed-in users can view anything (login and signup stay open).
- A "Support" page with the tiers in a grid (names, prices, descriptions), and a test
  checkout so the subscribe flow works without Stripe.
- Notifications (bell in the header, `/notifications`): creators hear about comments, likes and
  new followers or members (per tier); patrons hear about new posts and replies to their
  comments. Every kind can be switched off under Settings → Notifications. Comments support replies.
- Dark mode for the dashboard, settings and sign-in screens (toggle in the header).
- View counters (profile and per post) on the dashboard.

Not built yet: email verification, password reset, and federation. Login and sign-up
are rate limited per process (in memory), which suits a single instance; also rate limit
at your reverse proxy if the instance is public.

Security reports: see [SECURITY.md](./SECURITY.md).

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local development.
