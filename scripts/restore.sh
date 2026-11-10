#!/bin/sh
# Restores a backup made by scripts/backup.sh into the database and bucket named in the environment.
# THIS REPLACES WHATEVER IS THERE. Nothing happens unless RESTORE_CONFIRM=yes.
#
#   RESTORE_CONFIRM=yes DATABASE_URL=postgresql://... sh scripts/restore.sh backups/agora-20260101-030000
#
# Settings (environment): RESTORE_SKIP_DB / RESTORE_SKIP_MEDIA ("true" to skip that half) and
# BACKUP_DIR (where the shared media mirror lives, default: the folder that holds the backup).
# For a dump encrypted with age, set BACKUP_AGE_IDENTITY to the path of the private key file.
# With Docker Compose: docker compose run --rm -e RESTORE_CONFIRM=yes backup /scripts/restore.sh /backups/agora-...
set -eu

SRC="${1:-}"
[ -n "$SRC" ] && [ -d "$SRC" ] || { echo "Usage: RESTORE_CONFIRM=yes sh scripts/restore.sh <backup folder>" >&2; exit 2; }
if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  echo "Refusing to run: this overwrites the current database and media. Set RESTORE_CONFIRM=yes to go ahead." >&2
  exit 2
fi
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$SRC")}"

pg_url() {
  printf '%s' "$1" | sed -e 's/?schema=[^&]*&/?/' -e 's/[?&]schema=[^&]*//'
}

if [ "${RESTORE_SKIP_DB:-}" != "true" ]; then
  : "${DATABASE_URL:?DATABASE_URL is required (or set RESTORE_SKIP_DB=true)}"
  PGURL="$(pg_url "$DATABASE_URL")"
  DUMP="$SRC/db.dump"
  CLEANUP=""
  if [ ! -f "$DUMP" ] && [ -f "$SRC/db.dump.age" ]; then
    : "${BACKUP_AGE_IDENTITY:?This dump is encrypted: set BACKUP_AGE_IDENTITY to your private key file}"
    DUMP="$(mktemp)"
    CLEANUP="$DUMP"
    age -d -i "$BACKUP_AGE_IDENTITY" -o "$DUMP" "$SRC/db.dump.age"
  fi
  [ -f "$DUMP" ] || { echo "No db.dump in $SRC" >&2; exit 2; }
  echo "Restoring the database..."
  # One transaction: either the whole database is replaced or nothing changes.
  pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --dbname="$PGURL" "$DUMP"
  [ -z "$CLEANUP" ] || rm -f "$CLEANUP"
fi

if [ "${RESTORE_SKIP_MEDIA:-}" != "true" ]; then
  command -v aws > /dev/null || { echo "The AWS CLI is needed to copy media. Install it, or set RESTORE_SKIP_MEDIA=true." >&2; exit 1; }
  : "${MINIO_ENDPOINT:?MINIO_ENDPOINT is required (or set RESTORE_SKIP_MEDIA=true)}"
  : "${MINIO_BUCKET:?MINIO_BUCKET is required}"
  : "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
  : "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
  [ -d "$BACKUP_DIR/media" ] || { echo "No media mirror at $BACKUP_DIR/media" >&2; exit 2; }
  echo "Copying media back to the bucket..."
  AWS_ACCESS_KEY_ID="$MINIO_ROOT_USER" \
  AWS_SECRET_ACCESS_KEY="$MINIO_ROOT_PASSWORD" \
  AWS_DEFAULT_REGION="${MINIO_REGION:-us-east-1}" \
  AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
  AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    aws s3 sync "$BACKUP_DIR/media" "s3://$MINIO_BUCKET" --endpoint-url "$MINIO_ENDPOINT" --only-show-errors
fi

echo "Restored from $SRC. Start the app and check that you can log in and that pictures load."
