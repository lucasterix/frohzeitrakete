# Postgres Backup

Daily `pg_dump` of the FrohZeit Postgres container to the Hetzner host
filesystem, gzipped, with 30-day retention.

## One-time setup (on the Hetzner host)

```bash
# As the deploy user:
sudo cp /home/deploy/apps/frohzeitrakete/infra/backup/backup_postgres.sh /usr/local/bin/fzr_backup.sh
sudo chmod +x /usr/local/bin/fzr_backup.sh

# Cron entry – runs every night at 03:30
sudo crontab -e
# → Add this line:
# 30 3 * * *  /usr/local/bin/fzr_backup.sh >> /var/log/fzr_backup.log 2>&1
```

## Test it without waiting for cron

```bash
sudo /usr/local/bin/fzr_backup.sh
ls -lh /home/deploy/backups/postgres/
```

You should see a file like `fzr_frohzeit_2026-04-14_0330.sql.gz`.

## Restore

```bash
# Pick the dump you want
gunzip -c /home/deploy/backups/postgres/fzr_frohzeit_2026-04-14_0330.sql.gz \
  | docker exec -i fzr_postgres psql -U postgres -d frohzeit
```

## Off-site backups (recommended)

The local dumps protect against application bugs and accidental deletes,
but not against server loss. For off-site backups either:

- Sync `/home/deploy/backups/postgres/` to Hetzner Object Storage via
  `rclone` / `s3cmd` in a second cron step, or
- Use Hetzner's own daily full-disk snapshots (Cloud Console → Backups)

Pick at least one.
