#!/bin/sh
# A backup you have never restored is a hope, not a backup. This restores a backup into a throwaway database
# on the same server, checks that the data is really there, and drops it again. It never touches the live
# database or the bucket. Run it after setting up backups and then every so often.
#
#   DATABASE_URL=postgresql://... sh scripts/restore-drill.sh backups/agora-20260101-030000
#
# Needs psql and pg_restore, and a database user that may create databases. If a media mirror exists next
# to the backup, a few picture files named in the database are checked against it too.
# For an encrypted dump set BACKUP_AGE_IDENTITY. With Docker Compose:
#   docker compose run --rm backup /scripts/restore-drill.sh /backups/agora-...
set -eu

SRC="${1:-}"
[ -n "$SRC" ] && [ -d "$SRC" ] || { echo "Usage: sh scripts/restore-drill.sh <backup folder>" >&2; exit 2; }
: "${DATABASE_URL:?DATABASE_URL is required (it only tells the drill which server to use)}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$SRC")}"

PGURL="$(printf '%s' "$DATABASE_URL" | sed -e 's/?schema=[^&]*&/?/' -e 's/[?&]schema=[^&]*//')"
# The same server, a different database name.
swap_db() {
  printf '%s' "$PGURL" | sed -E "s#/[^/?]+(\\?.*)?\$#/$1\\1#"
}
ADMIN_URL="$(swap_db postgres)"
SCRATCH="agora_restore_drill"
SCRATCH_URL="$(swap_db "$SCRATCH")"

DUMP="$SRC/db.dump"
CLEANUP=""
if [ ! -f "$DUMP" ] && [ -f "$SRC/db.dump.age" ]; then
  : "${BACKUP_AGE_IDENTITY:?This dump is encrypted: set BACKUP_AGE_IDENTITY to your private key file}"
  DUMP="$(mktemp)"
  CLEANUP="$DUMP"
  age -d -i "$BACKUP_AGE_IDENTITY" -o "$DUMP" "$SRC/db.dump.age"
fi
[ -f "$DUMP" ] || { echo "No db.dump in $SRC" >&2; exit 2; }

cleanup() {
  psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $SCRATCH" > /dev/null 2>&1 || true
  [ -z "$CLEANUP" ] || rm -f "$CLEANUP"
}
trap cleanup EXIT

echo "Restoring $SRC into a scratch database..."
psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $SCRATCH" -c "CREATE DATABASE $SCRATCH"
pg_restore --no-owner --no-privileges --single-transaction --dbname="$SCRATCH_URL" "$DUMP"

count() {
  psql "$SCRATCH_URL" -tAc "SELECT count(*) FROM \"$1\""
}
USERS="$(count User)"
POSTS="$(count Post)"
MEDIA="$(count PostMedia)"
MIGRATIONS="$(psql "$SCRATCH_URL" -tAc 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"
echo "Restored: $USERS users, $POSTS posts, $MEDIA media rows, $MIGRATIONS applied migrations."

[ "$USERS" -gt 0 ] || { echo "FAILED: the restored database has no users." >&2; exit 1; }
[ "$MIGRATIONS" -gt 0 ] || { echo "FAILED: the restored database has no migration history." >&2; exit 1; }
OWNER="$(psql "$SCRATCH_URL" -tAc "SELECT count(*) FROM \"InstanceSetting\" WHERE \"ownerId\" IS NOT NULL")"
[ "$OWNER" -gt 0 ] || { echo "FAILED: the restored database has no site owner." >&2; exit 1; }

if [ "$MEDIA" -gt 0 ] && [ -d "$BACKUP_DIR/media" ]; then
  MISSING=0
  CHECKED=0
  for key in $(psql "$SCRATCH_URL" -tAc 'SELECT "objectKey" FROM "PostMedia" ORDER BY random() LIMIT 5'); do
    CHECKED=$((CHECKED + 1))
    [ -f "$BACKUP_DIR/media/$key" ] || { echo "Missing from the media mirror: $key" >&2; MISSING=$((MISSING + 1)); }
  done
  [ "$MISSING" -eq 0 ] || { echo "FAILED: $MISSING of $CHECKED sampled media files are missing from the mirror." >&2; exit 1; }
  echo "Media spot check: $CHECKED of $CHECKED sampled files are in the mirror."
elif [ "$MEDIA" -gt 0 ]; then
  echo "No media mirror at $BACKUP_DIR/media, so pictures were not checked."
fi

echo "Drill OK. The scratch database is dropped; your live data was never touched."
