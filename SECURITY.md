# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/pmcgurk/agora/security/advisories/new)
for this repository. Include steps to reproduce and the version or commit you tested.
You should get a reply within a few days.

## Hardening checklist for operators

- Create your creator account before sharing the URL (the first sign-up becomes the creator).
- Change `POSTGRES_PASSWORD`, `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`; the container
  refuses to start on an `https://` base URL with the development defaults.
- Serve Agora and MinIO over HTTPS and set `NEXT_PUBLIC_BASE_URL` / `MINIO_PUBLIC_ENDPOINT`
  to those public URLs. Do not publish MinIO's console (port 9001); compose binds it to localhost.
- Keep `SEED_DEMO_DATA=false` and, without Stripe, `ALLOW_FREE_SUBSCRIPTIONS=false`.
- Set `STRIPE_WEBHOOK_SECRET`; webhook requests without a valid signature are rejected.
- Back up the `postgres_data` and `minio_data` volumes.

## Design notes

- Media is never stored in PostgreSQL. Gated images are served by short-lived presigned URLs
  after an access check; gated video and audio are streamed through the app.
- Passwords are hashed with scrypt; sessions are random tokens stored hashed.
- API keys are stored hashed. Outgoing webhooks are signed (HMAC-SHA256).
- Creator-configured webhook URLs may point at private network addresses on purpose, so
  self-hosters can call local services. Only the creator can configure them.
- Login, sign-up and the API are rate limited in memory per process; add proxy-level limits
  for public instances.
