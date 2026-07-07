#!/usr/bin/env bash
# Build the ready-to-upload production folder at ./production — its CONTENTS
# mirror the server's app root (public_html). Zip the contents and extract
# over the app root on the server.
#
# Deliberately EXCLUDED (live only on the server, never overwritten):
#   .env       — production secrets
#   uploads/   — user-uploaded images
#
#   ./scripts/build-production.sh        → ./production/
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
OUT="$ROOT/production"

echo "==> Production build (same-origin SPA — dev VITE_* URLs are stripped)"
VITE_API_URL="" VITE_SOCKET_URL="" npm run build

echo "==> Assembling $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/shared" "$OUT/client" "$OUT/server" "$OUT/deploy" "$OUT/docs"

# Workspace skeleton + lockfile (npm ci on the server needs all of these).
cp package.json package-lock.json "$OUT/"

cp shared/package.json "$OUT/shared/" && cp -r shared/dist "$OUT/shared/dist"
cp client/package.json "$OUT/client/" && cp -r client/dist "$OUT/client/dist"
cp server/package.json "$OUT/server/" && cp -r server/dist "$OUT/server/dist"
# Prisma schema + migrations (migrate deploy) and src (npx tsx seed/imports).
cp -r server/prisma "$OUT/server/prisma"
cp -r server/src "$OUT/server/src"
cp server/tsconfig.json "$OUT/server/" 2>/dev/null || true

cp deploy/env.production.example "$OUT/deploy/"
cp deploy/auction-app.service "$OUT/deploy/"
cp deploy/nginx.conf.example "$OUT/deploy/"
cp deploy/htaccess.hostinger.example "$OUT/deploy/"
cp docs/deploy.md docs/deploy-hostinger.md "$OUT/docs/"

# Hosting platforms with auto-build pipelines run `npm run build` and `npm
# start` on the uploaded code. The folder is already built — make build a
# no-op and point start at the server entry (works from the app root).
node -e "
const fs = require('fs');
const p = '$OUT/package.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.scripts.build = 'echo \"prebuilt deploy package — nothing to build\"';
j.scripts.start = 'node server/dist/index.js';
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
"

echo
echo "Ready: $OUT"
echo "  1. Zip the folder's CONTENTS (not the folder itself):"
echo "       cd production && zip -r ../production.zip ."
echo "  2. Upload and extract over the app root (public_html)."
echo "     .env and uploads/ on the server are untouched — do not delete them."
echo "  3. On the server: npm ci --omit=dev (only if dependencies changed),"
echo "     npm run prisma:deploy -w server (only if migrations changed),"
echo "     then: mkdir -p tmp && touch tmp/restart.txt"
