# Contributing

Thanks for helping build Agora. Contributions should preserve the project's
self-hosted, creator-first direction and follow the architecture rules in
[llm.txt](./llm.txt).

## Local development

Requires Node.js 22 or later and Docker. Run npm from the same environment as
the repository (for example inside WSL for a WSL checkout), not across a
`\\wsl.localhost` path.

```sh
cp .env.example .env
docker compose up -d postgres minio              # backing services only
npm install
set -a; . ./.env; set +a                         # load .env into this shell
node scripts/ensure-bucket.mjs                   # create the media bucket
npx prisma migrate deploy
npx prisma db seed                               # optional demo data
npm run dev
```

The app runs at <http://localhost:3000> and reads `DATABASE_URL` and the MinIO
variables from `.env`. Free video previews need `ffmpeg` on your `PATH` (or set
`FFMPEG_PATH`); the Docker image already includes it.

After changing `prisma/schema.prisma`, create a migration with
`npx prisma migrate dev --name <change>` and commit it.

Before opening a pull request, run `npx tsc --noEmit`, `npm run lint` and
`npm run build`.

## Running everything in Docker

`docker compose up -d --build` rebuilds the image and restarts the stack. The
app container applies migrations on every start.

## Changes and pull requests

- Keep changes focused and include tests when adding behavior.
- Do not commit credentials, local environment files, or generated build output.
- Explain user-visible changes and any database or deployment impact.

## Before opening a pull request

Run `npx tsc --noEmit` and `npm run lint` (CI also runs `npm run build`). Schema changes need a
new migration in `prisma/migrations`, never an edit to an applied one. To work on payments without
a Stripe account leave `STRIPE_SECRET_KEY` unset and keep `ALLOW_FREE_SUBSCRIPTIONS=true`; with a
Stripe test key, forward webhooks using `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
Report security issues privately, see [SECURITY.md](./SECURITY.md).
