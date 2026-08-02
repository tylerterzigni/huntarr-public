#!/bin/sh
set -e

echo "Running database migrations..."
node --import tsx src/lib/db/migrate.ts

echo "Seeding admin user if needed..."
node --import tsx src/lib/db/seed.ts

echo "Starting Huntarr..."
exec "$@"
