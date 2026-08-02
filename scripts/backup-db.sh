#!/usr/bin/env bash
# Backup Huntarr Postgres from a running Docker container (pg_dump → gzip).
# Usage: ./scripts/backup-db.sh [--container huntarr-db] [--out-dir backups]
set -euo pipefail

CONTAINER="${HUNTARR_DB_CONTAINER:-huntarr-db}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="${REPO_ROOT}/backups"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --container|-c)
      CONTAINER="$2"
      shift 2
      ;;
    --out-dir|-o)
      OUT_DIR="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--container huntarr-db] [--out-dir backups]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "Container '$CONTAINER' is not running." >&2
  exit 1
fi

PG_USER="$(docker exec "$CONTAINER" printenv POSTGRES_USER 2>/dev/null || true)"
PG_DB="$(docker exec "$CONTAINER" printenv POSTGRES_DB 2>/dev/null || true)"
PG_USER="${PG_USER:-huntarr}"
PG_DB="${PG_DB:-huntarr}"

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE_NAME="huntarr-${STAMP}.sql.gz"
OUT_FILE="${OUT_DIR}/${FILE_NAME}"
REMOTE_PATH="/tmp/${FILE_NAME}"

echo "Backing up database '${PG_DB}' from container '${CONTAINER}'..."

docker exec "$CONTAINER" sh -c "pg_dump -U \"${PG_USER}\" -d \"${PG_DB}\" --no-owner --no-acl | gzip -c > \"${REMOTE_PATH}\""
docker cp "${CONTAINER}:${REMOTE_PATH}" "$OUT_FILE"
docker exec "$CONTAINER" rm -f "$REMOTE_PATH" >/dev/null

BYTES="$(wc -c < "$OUT_FILE" | tr -d ' ')"
echo "Backup written: ${OUT_FILE} (${BYTES} bytes)"
echo "$OUT_FILE"
