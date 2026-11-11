# Backups and restoring

Agora keeps nothing on the server it runs on. A whole site is two things:

1. **The Postgres database**: posts, members, tiers, comments, settings, and the keys you saved in Settings.
2. **The media bucket**: pictures, video and files.

Back up both, keep a copy somewhere other than the machine the site runs on, and **practise restoring**. A backup
you have never restored is a hope, not a backup.

The scripts in [`scripts/`](../scripts) do all three jobs and work with any host:

| Script | What it does |
|---|---|
| `backup.sh` | Dumps the database to a dated folder and mirrors the media bucket next to it. |
| `restore-drill.sh` | Restores a backup into a throwaway database and checks the data is really there. Never touches the live site. |
| `restore.sh` | Replaces the live database and bucket with a backup. Refuses to run unless you say `RESTORE_CONFIRM=yes`. |

## Take a backup

**With Docker Compose** (the repo's `docker-compose.yml`):

```sh
docker compose run --rm backup
```

This builds a small image with `pg_dump` and the AWS CLI, and writes to `./backups`:

```
backups/
  agora-20261110-030000/   db.dump + MANIFEST.txt (counts of users, posts, media)
  agora-20261111-030000/
  media/                   one shared mirror of the bucket
```

The media mirror is copied once and then only topped up, so a daily backup stays small. Nothing is ever deleted
from the mirror, so a file removed from the bucket by mistake is still in your backup.

**Without Compose**, run the script where `pg_dump` (same major version as your server, or newer) and the AWS CLI are
installed. It reads the same variables the app does:

```sh
DATABASE_URL=postgresql://user:pass@host/agora \
MINIO_ENDPOINT=https://<account>.r2.cloudflarestorage.com MINIO_BUCKET=agora-media \
MINIO_ROOT_USER=... MINIO_ROOT_PASSWORD=... \
sh scripts/backup.sh
```

It works with MinIO, Cloudflare R2, AWS S3, Backblaze B2 and anything else S3-compatible. Set `BACKUP_SKIP_MEDIA=true`
or `BACKUP_SKIP_DB=true` to do half the job, `BACKUP_DIR` to choose where backups go, and `BACKUP_KEEP` (default 14) for
how many dated dumps to keep.

## Do it every day

Backups only count if they happen without you. Pick one:

- **A cron job** on the server: `0 3 * * * cd /srv/agora && docker compose run --rm backup >> backup.log 2>&1`
- **A systemd timer**, or your host's scheduled-job feature.
- **Your database host's own backups** (Render, Neon, Supabase and similar offer them on paid plans). Check what plan you
  have, how far back they go and how to restore them. They cover the database only, so you still need the media bucket.

Make failures loud. Have the job ping a monitor such as healthchecks.io after a successful run, so silence means
something went wrong:

```sh
docker compose run --rm backup && curl -fsS https://hc-ping.com/<your-uuid> > /dev/null
```

## Keep a copy somewhere else

A backup on the same disk as the site is lost with the site. After each run, copy the `backups` folder off the machine:
`rclone sync backups remote:agora-backups`, `rsync -a backups/ other-host:agora-backups/`, or
`aws s3 sync backups s3://my-backup-bucket/agora --endpoint-url ...`. Use a different provider or account than the one
that runs the site.

## Backups contain secrets

The database holds password hashes, API keys (hashed), webhook secrets, and the Stripe and SMTP credentials you saved in
Settings. Treat `backups/` like a password file: keep it out of git (`/backups/` is already in `.gitignore`), restrict who
can read it, and encrypt it before it leaves the server.

To encrypt the database dump, install [age](https://github.com/FiloSottile/age), make a key once with
`age-keygen -o key.txt` (keep `key.txt` somewhere safe and **separate from the backups**, or you cannot restore), and set
the public key it prints:

```sh
BACKUP_AGE_RECIPIENT=age1... docker compose run --rm backup
```

The dump is then `db.dump.age`. The restore scripts take `BACKUP_AGE_IDENTITY=/path/to/key.txt` to read it. The media
mirror is not encrypted, so encrypt the whole folder in transit if that matters to you.

What a backup does **not** contain is your environment: `.env` or the variables set on your host (database password,
storage keys, `SETUP_TOKEN`, mail settings). Keep a copy of those in a password manager.

**Keep `APP_SECRET` with them.** The Stripe keys and SMTP password saved in Settings are encrypted in the database with a key
made from it, so a restored backup can only read them if `APP_SECRET` has the same value. If you have lost it, restore
anyway and enter those keys again in Settings.

## The restore drill

Do this once when you set backups up, and again every few months, or after changing hosts or storage:

```sh
docker compose run --rm backup /scripts/restore-drill.sh /backups/agora-20261110-030000
```

It restores the dump into a scratch database on the same server, then checks that there are users, a site owner, applied
migrations and posts, and that a handful of picture files named in the database are in the media mirror. It drops the
scratch database afterwards and never touches the live site. It exits with an error if anything is missing, so it is safe
to run from a job too.

Now and then also do the human version: restore into a spare environment, start the app against it, log in, open a few
posts and check that the pictures load.

## Restoring for real

Use this when the database is lost or damaged, or you are moving to a new host.

1. Start an empty Postgres and an empty bucket (the app creates the tables itself when it starts, but restoring over an
   empty database is the cleanest).
2. Point the environment at them, then run the restore. **It replaces what is there**:

   ```sh
   docker compose run --rm -e RESTORE_CONFIRM=yes backup /scripts/restore.sh /backups/agora-20261110-030000
   ```

   Set `RESTORE_SKIP_DB=true` or `RESTORE_SKIP_MEDIA=true` to restore only one half. The database restore runs in one
   transaction, so it either replaces everything or changes nothing.
3. Start the app. It applies any newer migrations on start.
4. Check you can log in, posts appear and pictures load.

What you lose is whatever happened after the backup was taken, so a daily backup means up to a day. Run it more often if
that is too much.

## Moving to a new host

A backup is also how you move: restore into the new database and bucket, copy your environment across (changing
`NEXT_PUBLIC_BASE_URL` and the storage settings if they differ), and point the domain at the new host.
