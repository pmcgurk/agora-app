#!/bin/sh
set -e

# Refuse to run a public (https) instance with the well-known development passwords.
case "$NEXT_PUBLIC_BASE_URL" in
  https://*)
    if echo "$DATABASE_URL" | grep -q "agora_dev_password" || [ "$MINIO_ROOT_PASSWORD" = "agora_dev_minio_password" ]; then
      echo "Refusing to start: NEXT_PUBLIC_BASE_URL is https but default development passwords are in use." >&2
      echo "Set POSTGRES_PASSWORD and MINIO_ROOT_PASSWORD in .env (see .env.example)." >&2
      exit 1
    fi
    ;;
esac

echo "Ensuring media bucket exists..."
node scripts/ensure-bucket.mjs

echo "Applying database migrations..."
npx prisma migrate deploy

if [ "$SEED_DEMO_DATA" = "true" ]; then
  echo "Seeding demo data..."
  npx prisma db seed
fi

exec npx next start --hostname 0.0.0.0 --port 3000
