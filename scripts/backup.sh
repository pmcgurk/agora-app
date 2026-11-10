#!/bin/sh
# Backs up an Agora site: the Postgres database and the media bucket. Agora itself keeps nothing else, so
# these two are the whole site. See docs/backups.md.
#
#   DATABASE_URL=postgresql://... MINIO_ENDPOINT=... MINIO_BUCKET=... MINIO_ROOT_USER=... \
#   MINIO_ROOT_PASSWORD=... sh scripts/backup.sh
#
# Needs pg_dump (the same major version as the server or newer) and, for media, the AWS CLI (it talks to
# MinIO, R2, S3 and anything else S3-compatible). With Docker Compose, `docker compose run --rm backup`
# has both.
#
# Settings (environment):
#   BACKUP_DIR            where backups go (default ./backups)
#   BACKUP_KEEP           how many database dumps to keep (default 14)
#   BACKUP_SKIP_DB        "true" to skip the database
#   BACKUP_SKIP_MEDIA     "true" to skip the media bucket
#   BACKUP_AGE_RECIPIENT  an age public key: the database dump is then encrypted for it (needs `age`)
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${BACKUP_KEEP:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/agora-$STAMP"

# libpq does not understand Prisma's ?schema=public, so take it off.
pg_url() {
  printf '%s' "$1" | sed -e 's/?schema=[^&]*&/?/' -e 's/[?&]schema=[^&]*//'
}

mkdir -p "$DEST"
echo "Backing up to $DEST"

if [ "${BACKUP_SKIP_DB:-}" != "true" ]; then
  : "${DATABASE_URL:?DATABASE_URL is required (or set BACKUP_SKIP_DB=true)}"
  PGURL="$(pg_url "$DATABASE_URL")"
  echo "Dumping the database..."
  pg_dump --format=custom --no-owner --no-privileges --file="$DEST/db.dump" "$PGURL"
  # A dump that cannot be listed cannot be restored, so find out now.
  pg_restore --list "$DEST/db.dump" > /dev/null

  {
    echo "Agora backup $STAMP (UTC)"
    echo "pg_dump: $(pg_dump --version)"
    echo "users:   $(psql "$PGURL" -tAc 'SELECT count(*) FROM "User"')"
    echo "posts:   $(psql "$PGURL" -tAc 'SELECT count(*) FROM "Post"')"
    echo "media:   $(psql "$PGURL" -tAc 'SELECT count(*) FROM "PostMedia"')"
    echo "migrations: $(psql "$PGURL" -tAc 'SELECT count(*) FROM _prisma_migrations')"
  } > "$DEST/MANIFEST.txt"

  if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
    command -v age > /dev/null || { echo "BACKUP_AGE_RECIPIENT is set but the age tool is not installed." >&2; exit 1; }
    age -r "$BACKUP_AGE_RECIPIENT" -o "$DEST/db.dump.age" "$DEST/db.dump"
    rm "$DEST/db.dump"
    echo "Encrypted the dump for the given age key."
  fi
fi

if [ "${BACKUP_SKIP_MEDIA:-}" != "true" ]; then
  command -v aws > /dev/null || { echo "The AWS CLI is needed to copy media. Install it, or set BACKUP_SKIP_MEDIA=true." >&2; exit 1; }
  : "${MINIO_ENDPOINT:?MINIO_ENDPOINT is required (or set BACKUP_SKIP_MEDIA=true)}"
  : "${MINIO_BUCKET:?MINIO_BUCKET is required}"
  : "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
  : "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
  echo "Copying media (only what is new since the last backup)..."
  # One shared mirror next to the dated dumps. Nothing is ever deleted from it, so a file removed from the
  # bucket by mistake is still here. Recent AWS CLI versions add checksums that some S3-compatible
  # services reject, hence the two "when_required" settings.
  AWS_ACCESS_KEY_ID="$MINIO_ROOT_USER" \
  AWS_SECRET_ACCESS_KEY="$MINIO_ROOT_PASSWORD" \
  AWS_DEFAULT_REGION="${MINIO_REGION:-us-east-1}" \
  AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
  AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    aws s3 sync "s3://$MINIO_BUCKET" "$BACKUP_DIR/media" --endpoint-url "$MINIO_ENDPOINT" --only-show-errors
fi

# Keep the newest few dumps, newest first, and remove the rest.
ls -1d "$BACKUP_DIR"/agora-* 2> /dev/null | sort -r | awk -v keep="$KEEP" 'NR > keep' | while read -r old; do
  echo "Removing old backup $old"
  rm -rf "$old"
done

echo "Done: $DEST"
