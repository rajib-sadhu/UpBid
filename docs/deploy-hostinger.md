# Deploying to Hostinger — runbook for auction.rsdev.in

The exact process used for the first production deployment (2026-07-08) on
Hostinger shared Node.js hosting. Generic instructions live in
[deploy.md](./deploy.md); this file records the Hostinger-specific details and
gotchas so the next deploy is a 10-minute job.

**Server facts**

| What            | Value                                                   |
| --------------- | ------------------------------------------------------- |
| Domain          | `https://auction.rsdev.in`                               |
| SSH user/host   | `u237355130@in-mum-web1674`                              |
| App root        | `~/domains/auction.rsdev.in/public_html`                 |
| MySQL DB / user | `u237355130_auction` / `u237355130_auction` (hPanel)     |
| Node on SSH     | `/opt/alt/alt-nodejs20/root/usr/bin` (not on PATH!)      |

---

## 1. Build the package (dev machine)

```bash
./scripts/package-deploy.sh        # → auction-app-deploy-YYYYMMDD.zip
```

The zip is pre-built. Its root `package.json` ships `build` as a **no-op** and
`start` as `node server/dist/index.js` — Hostinger's deploy pipeline runs
`npm install` → `npm run build` → `npm start` on whatever you upload, and a
real build would fail (no TS sources in the package). Don't hand-edit that.

## 2. Upload

Upload the zip (hPanel File Manager or the Node.js deployment screen) and
extract so the app files sit directly in `public_html/` (`server/`, `client/`,
`shared/`, `deploy/`, `docs/`, `uploads/`, `package.json`,
`package-lock.json`).

**How the app actually runs (what worked): LiteSpeed Passenger via
`.htaccess`** — no hPanel Node.js configuration needed. Copy
`deploy/htaccess.hostinger.example` to `public_html/.htaccess` (paths already
match this account). The first request spawns the app; Passenger keeps it
alive, respawns on crash, and survives server reboots.

- Restart the app: `mkdir -p tmp && touch tmp/restart.txt` (next request
  restarts it).
- **Exactly 1 instance** — in-memory lot timers; two instances corrupt live
  auctions. Verify with `ps aux | grep "server/dist"` (expect one process),
  especially during the first live auction.

## 3. SSH setup (first deploy only)

Node is installed but **not on the shell PATH** (CloudLinux `alt-nodejs`):

```bash
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH
echo 'export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH' >> ~/.bashrc
node -v    # v20.x
```

### Database (hPanel → Databases → MySQL)

Create DB + user (Hostinger prefixes both with the account id). ⚠️ If the DB
password contains special characters they must be **URL-encoded** in
`DATABASE_URL` — e.g. `@` → `%40`, `#` → `%23` — or everything after them is
parsed as the hostname.

### .env (in the app root, next to package.json)

```bash
cd ~/domains/auction.rsdev.in/public_html
cp deploy/env.production.example .env
nano .env
```

```env
NODE_ENV=production
CLIENT_ORIGIN=https://auction.rsdev.in
DATABASE_URL=mysql://u237355130_auction:URL_ENCODED_PASSWORD@127.0.0.1:3306/u237355130_auction
JWT_SECRET=<openssl rand -base64 48>
PEPPER=<openssl rand -base64 48>
JWT_EXPIRES_IN=7d
UPLOAD_DIR=../uploads
SEED_ADMIN_EMAIL=rajib@digineo.co.in
SEED_ADMIN_PASSWORD=<strong password>
```

- **No `PORT` line** — the Hostinger pipeline injects its own.
- The boot guard refuses placeholder/short `JWT_SECRET` or an empty `PEPPER`.
- **`PEPPER` is permanent** once accounts exist — changing it invalidates every
  password. Keep an offline backup of this file.

## 4. Migrate + seed

```bash
cd ~/domains/auction.rsdev.in/public_html
npm ci --omit=dev                  # also runs prisma generate (postinstall)
npm run prisma:deploy -w server    # "All migrations have been successfully applied."
npm run db:seed -w server          # "✓ super admin" + "✓ 6 football formations"
```

## 5. Restart & verify

Restart the app from hPanel, then:

- `https://auction.rsdev.in/api/health` → `{"status":"ok",...}` (pings MySQL —
  a 503 means the `DATABASE_URL` is wrong).
- Log in as the seeded admin over HTTPS; create an organizer.
- Upload a player photo (proves `uploads/` is writable).

Socket.io note: if the host's proxy doesn't pass WebSockets, the client falls
back to HTTP long-polling automatically — live auctions still work.

## 6. Updating to a new version

1. `./scripts/build-production.sh` → zip the **contents** of `./production/`
   (`cd production && zip -r ../production.zip .`), upload, extract over
   `public_html`. The folder deliberately contains no `.env` and no `uploads/`,
   so the server's copies are never touched.
3. SSH: `npm ci --omit=dev` → `npm run prisma:deploy -w server` →
   `mkdir -p tmp && touch tmp/restart.txt` to restart. (No re-seed. Also keep
   `.htaccess` — re-copy from `deploy/htaccess.hostinger.example` if the upload
   replaced it.)

## Gotchas hit on the first deploy (all fixed in the package)

- Pipeline ran `npm run build` and failed with `TS5058: tsconfig.build.json
  not found` → the package now ships a no-op build script.
- `npm: command not found` over SSH → `alt-nodejs20` PATH export above.
- DB password contained `@` → URL-encode it in `DATABASE_URL`.
- `.env` lookup and the uploads path used to depend on the launch directory →
  the server now resolves both robustly (app root or `server/`).
- The hPanel Node.js deploy pipeline and its `.builds/` flow turned out to be
  unnecessary — the domain never routed to the app that way. The working
  mechanism is the Passenger `.htaccess` above, pure SSH.
- **Prisma's Rust engines (both "library" and "binary") panic on CloudLinux**
  with `PANIC: timer has gone away` — the host's LVE thread limits kill the
  tokio runtime. Permanent fix (in the codebase since 2026-07-08): the client
  runs Rust-engine-free (`previewFeatures = ["queryCompiler", "driverAdapters"]`
  + `@prisma/adapter-mariadb`), pure JS/WASM. No `.env` workaround needed;
  `PRISMA_CLIENT_ENGINE_TYPE` is ignored and can be removed. Note
  `prisma migrate deploy` still uses the schema engine — that one works on
  this host.

## Backups (set up before the first real auction)

Nightly cron (hPanel → Advanced → Cron Jobs):

```bash
mysqldump -u u237355130_auction -p'DB_PASSWORD' u237355130_auction | gzip > ~/backups/auction-$(date +\%F).sql.gz
tar -czf ~/backups/uploads-$(date +\%F).tar.gz -C ~/domains/auction.rsdev.in/public_html uploads
```
