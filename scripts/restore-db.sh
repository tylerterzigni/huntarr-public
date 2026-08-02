#!/usr/bin/env bash
# Restore Huntarr Postgres from a dump file (DESTRUCTIVE).
# Requires --dump and typing RESTORE. Never part of the default update path.
# Usage:
#   ./scripts/restore-db.sh --dump backups/huntarr-YYYYMMDD-HHMMSS.sql.gz
#   ./scripts/restore-db.sh --dump FILE --container huntarr-db --env MediaServer
set -euo pipefail

CONTAINER="${HUNTARR_DB_CONTAINER:-huntarr-db}"
DUMP_FILE=""
ENVIRONMENT="Windows"
ALLOW_CROSS=0

usage() {
  cat <<'EOF'
Usage: restore-db.sh --dump PATH [--container huntarr-db] [--env Windows|MediaServer] [--allow-cross-environment]

Restore overwrites the target database. Type RESTORE at the prompt to continue.
Windows Docker and MediaServer databases are strictly separate.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dump|-d)
      DUMP_FILE="$2"
      shift 2
      ;;
    --container|-c)
      CONTAINER="$2"
      shift 2
      ;;
    --env|-e)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --allow-cross-environment)
      ALLOW_CROSS=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$DUMP_FILE" ]]; then
  echo "Refusing restore: --dump PATH is required." >&2
  usage >&2
  exit 1
fi

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "Dump file not found: $DUMP_FILE" >&2
  exit 1
fi

DUMP_FILE="$(cd "$(dirname "$DUMP_FILE")" && pwd)/$(basename "$DUMP_FILE")"
LOWER="$(printf '%s' "$DUMP_FILE" | tr '[:upper:]' '[:lower:]')"

if [[ "$ENVIRONMENT" == "MediaServer" && "$ALLOW_CROSS" -eq 0 ]]; then
  if [[ "$LOWER" == *onedrive* || "$LOWER" == *"/projects/huntarr"* || "$LOWER" == *windows* ]]; then
    echo "Refusing Windows-looking dump onto MediaServer without --allow-cross-environment." >&2
    exit 1
  fi
fi

if [[ "$ENVIRONMENT" == "Windows" && "$ALLOW_CROSS" -eq 0 ]]; then
  if [[ "$LOWER" == *mediaserver* || "$LOWER" == *"/mnt/md0/"* ]]; then
    echo "Refusing MediaServer-looking dump onto Windows without --allow-cross-environment." >&2
    exit 1
  fi
fi

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "Container '$CONTAINER' is not running." >&2
  exit 1
fi

PG_USER="$(docker exec "$CONTAINER" printenv POSTGRES_USER 2>/dev/null || true)"
PG_DB="$(docker exec "$CONTAINER" printenv POSTGRES_DB 2>/dev/null || true)"
PG_USER="${PG_USER:-huntarr}"
PG_DB="${PG_DB:-huntarr}"

echo ""
echo "WARNING: This will OVERWRITE database '${PG_DB}' in container '${CONTAINER}' (${ENVIRONMENT})."
echo "Dump: ${DUMP_FILE}"
echo "Restore is NOT part of the normal update path."
echo ""
read -r -p "Type RESTORE to continue (anything else aborts): " CONFIRM
if [[ "$CONFIRM" != "RESTORE" ]]; then
  echo "Aborted. No changes made."
  exit 1
fi

REMOTE_SQL="/tmp/huntarr-restore-incoming.sql"

if [[ "$DUMP_FILE" == *.gz ]]; then
  REMOTE_GZ="/tmp/huntarr-restore-incoming.sql.gz"
  docker cp "$DUMP_FILE" "${CONTAINER}:${REMOTE_GZ}"
  docker exec "$CONTAINER" sh -c "gunzip -c \"${REMOTE_GZ}\" > \"${REMOTE_SQL}\" && rm -f \"${REMOTE_GZ}\""
else
  docker cp "$DUMP_FILE" "${CONTAINER}:${REMOTE_SQL}"
fi

echo "Restoring into '${PG_DB}'..."
docker exec "$CONTAINER" sh -c "psql -U \"${PG_USER}\" -d \"${PG_DB}\" -v ON_ERROR_STOP=1 -f \"${REMOTE_SQL}\""
docker exec "$CONTAINER" rm -f "$REMOTE_SQL" >/dev/null

echo "Restore complete."
