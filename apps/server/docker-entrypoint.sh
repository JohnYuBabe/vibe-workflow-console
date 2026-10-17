#!/bin/sh
set -e

echo "[entrypoint] prisma migrate deploy"
./node_modules/.bin/prisma migrate deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] seeding demo data"
  ./node_modules/.bin/tsx prisma/seed.ts
fi

exec node dist/main.js
