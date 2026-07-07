# Deploying the Auction App

One Node process serves everything: the built React app, the `/api` REST
routes, `/uploads` images, and the Socket.io live-auction gateway. It needs
**Node 20+**, **MySQL 8**, and outbound network for `npm install`.

> ⚠️ **Run exactly ONE instance.** Lot timers and event sequencing live in
> process memory — a second instance against the same database would corrupt
> live auctions. (Vertical scaling is fine; horizontal is not, yet.)

## 0. Build the package (on your dev machine)

```bash
./scripts/package-deploy.sh
```

This produces `auction-app-deploy-YYYYMMDD.zip` containing the production
builds (`server/dist`, `client/dist`, `shared/dist`), the Prisma schema +
migrations, `server/src` (needed only for the one-time seed script), config
samples in `deploy/`, and this guide. `node_modules` is intentionally absent —
installing on the server builds the Prisma engine for that platform.

## 1. Database

Create a database and user (any MySQL 8):

```sql
CREATE DATABASE auction CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'auction_user'@'localhost' IDENTIFIED BY 'STRONG_DB_PASSWORD';
GRANT ALL PRIVILEGES ON auction.* TO 'auction_user'@'localhost';
```

On shared hosting, use the panel's "MySQL Databases" page instead — note the
prefixed names it generates (e.g. `cpuser_auction`).

## 2. Upload & configure

1. Upload the zip and extract it — you get an `auction-app/` folder (the "app
   root" from here on).
2. Copy `deploy/env.production.example` to `.env` **in the app root** and fill
   it in. Generate the two secrets with `openssl rand -base64 48`. The server
   **refuses to boot** in production with placeholder/short `JWT_SECRET` or an
   empty `PEPPER` — and the pepper cannot be changed later without invalidating
   every password.
3. Install runtime dependencies (also generates the Prisma client):

   ```bash
   cd auction-app
   npm ci --omit=dev
   ```

4. Apply migrations, then seed the super admin + football formations (one time):

   ```bash
   npm run prisma:deploy -w server
   npm run db:seed -w server        # uses SEED_ADMIN_EMAIL/PASSWORD from .env
   ```

## 3a. Start it — shared Node host (cPanel / Passenger)

1. Panel → **Setup Node.js App** → Create application:
   - Node version: 20+
   - Application root: the extracted `auction-app` folder
   - Application startup file: `server/dist/index.js`
2. Add the environment variables from your `.env` in the app's UI (Passenger
   sets `PORT` itself — don't set it). Keeping the `.env` file in the app root
   also works; the server reads it at boot.
3. Ensure the app runs with **1 instance / 1 process** (see the warning above).
4. Point your (sub)domain at the application; the panel's AutoSSL usually
   provides HTTPS. Socket.io falls back to HTTP long-polling automatically if
   the host's proxy doesn't pass WebSockets — the live auction still works,
   just with slightly higher latency.

## 3b. Start it — your own server (systemd + Nginx)

```bash
sudo mkdir -p /var/www/auction-app && sudo chown www-data: /var/www/auction-app
# extract the zip there, then steps 2.2–2.4 as the www-data user
sudo cp deploy/auction-app.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now auction-app
journalctl -u auction-app -f     # watch it boot
```

Put Nginx in front (WebSocket upgrade headers are required — see
`deploy/nginx.conf.example`), then get HTTPS:

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/auction-app
# edit server_name, then:
sudo ln -s /etc/nginx/sites-available/auction-app /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d auction.example.com
```

## 4. Verify

- `https://your-domain/api/health` → `{"status":"ok",...}` (it pings MySQL —
  503 means the DB is unreachable).
- Log in with the seeded admin, create an organizer, open a live auction page
  and check the connection indicator says **connected**.
- Upload a player photo (proves `/uploads` is writable).

## 5. Updating to a new version

1. Build a fresh zip, upload, extract **over** the app root (or into a new
   folder and move `.env` + `uploads/` across).
2. `npm ci --omit=dev` → `npm run prisma:deploy -w server` → restart the app
   (panel restart button, or `sudo systemctl restart auction-app`).
   The server drains connections gracefully on restart, and crash recovery
   re-arms any live lot timers on boot.

## 6. Backups (do this before your first real auction)

```bash
# Nightly DB dump (keep ~14 days) — add to crontab:
0 3 * * * mysqldump -u auction_user -p'...' auction | gzip > /backups/auction-$(date +\%F).sql.gz
# Uploaded images:
15 3 * * * tar -czf /backups/uploads-$(date +\%F).tar.gz -C /var/www/auction-app uploads
```

## Production checklist

- [ ] `NODE_ENV=production`, real `JWT_SECRET` + `PEPPER` (48+ random chars)
- [ ] `CLIENT_ORIGIN` = your exact public origin (scheme + domain)
- [ ] Migrations applied, admin seeded, login verified over HTTPS
- [ ] Exactly one app instance
- [ ] Backups scheduled (DB + uploads)
- [ ] MySQL not exposed publicly (bind 127.0.0.1 / firewall 3306)
