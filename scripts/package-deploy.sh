#!/usr/bin/env bash
# Build a production deploy zip: everything the server needs, nothing it
# doesn't (no node_modules — `npm install --omit=dev` runs on the host, which
# also generates the Prisma client for that platform via postinstall).
#
#   ./scripts/package-deploy.sh          → auction-app-deploy-YYYYMMDD.zip
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d)"
OUT="auction-app-deploy-${STAMP}.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "==> Production build (same-origin SPA — dev VITE_* URLs are stripped)"
VITE_API_URL="" VITE_SOCKET_URL="" npm run build

echo "==> Staging files"
APP="$STAGE/auction-app"
mkdir -p "$APP"

# Workspace skeleton + lockfile (npm ci on the server needs all of these).
cp package.json package-lock.json "$APP/"

# Hosting platforms with auto-build pipelines run `npm run build` and `npm
# start` on the uploaded code. The package is already built — make build a
# no-op and point start at the server entry (works from the app root).
node -e "
const fs = require('fs');
const p = '$APP/package.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.scripts.build = 'echo \"prebuilt deploy package — nothing to build\"';
j.scripts.start = 'node server/dist/index.js';
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
"

mkdir -p "$APP/shared" "$APP/client" "$APP/server" "$APP/uploads" "$APP/deploy" "$APP/docs"
cp shared/package.json "$APP/shared/" && cp -r shared/dist "$APP/shared/dist"
cp client/package.json "$APP/client/" && cp -r client/dist "$APP/client/dist"
cp server/package.json "$APP/server/" && cp -r server/dist "$APP/server/dist"
# Prisma schema + migrations (migrate deploy) and src (npx tsx seed/imports).
cp -r server/prisma "$APP/server/prisma"
cp -r server/src "$APP/server/src"
cp server/tsconfig.json "$APP/server/" 2>/dev/null || true

cp deploy/env.production.example "$APP/deploy/"
cp deploy/auction-app.service "$APP/deploy/"
cp deploy/nginx.conf.example "$APP/deploy/"
cp deploy/htaccess.hostinger.example "$APP/deploy/"
cp docs/deploy.md "$APP/docs/"
touch "$APP/uploads/.keep"

echo "==> Zipping → $OUT"
rm -f "$OUT"
(cd "$STAGE" && zip -qr "$ROOT/$OUT" auction-app)
du -h "$OUT"
echo "Done. Upload $OUT and follow docs/deploy.md."
