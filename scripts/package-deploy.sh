#!/usr/bin/env bash
# Build a production deploy zip (wrapper around build-production.sh, which
# assembles the ./production folder). The zip wraps everything in an
# auction-app/ folder — used for first-time deploys; for updates you can also
# just run build-production.sh and zip its contents yourself.
#
#   ./scripts/package-deploy.sh          → auction-app-deploy-YYYYMMDD.zip
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

"$ROOT/scripts/build-production.sh"

STAMP="$(date +%Y%m%d)"
OUT="auction-app-deploy-${STAMP}.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp -r "$ROOT/production" "$STAGE/auction-app"
# First-time installs need the uploads dir to exist (kept out of update zips
# so extracting never touches the server's real uploads).
mkdir -p "$STAGE/auction-app/uploads"
touch "$STAGE/auction-app/uploads/.keep"

echo "==> Zipping → $OUT"
rm -f "$OUT"
(cd "$STAGE" && zip -qr "$ROOT/$OUT" auction-app)
du -h "$OUT"
echo "Done. Upload $OUT and follow docs/deploy.md."
