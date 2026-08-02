# Database Safety

## What lives in Postgres

User accounts, likes, hide lists, AI/recommendation preferences, encrypted integration settings, and Plex/Tautulli caches. **Not** in the app image.

## Safe updates

1. Pull/rebuild the **app** container only.
2. Leave the Postgres volume or data directory untouched.
3. On start, Huntarr runs additive migrations, then seed (admin only if zero users).

## Forbidden if you care about data

- `docker compose down -v`
- Deleting the Postgres volume or `./data/postgres` bind
- Changing `SETTINGS_ENCRYPTION_KEY` on a live database
- Restoring another machine’s dump over this one without intent and a backup

## Backups

If backup scripts are present in `scripts/`, use them against your running Postgres container. Always backup before risky restores or major upgrades.

## Environments

If you run more than one Huntarr (e.g. laptop + NAS), keep **separate** databases and secrets. Do not copy volumes between them unless you mean to migrate.
