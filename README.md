# Sports Auction Platform

Multi-sport, IPL-style **live player-auction platform**. Organizers run live English
auctions where teams bid for players under a credit budget; teams then build and lock
post-auction lineups (cricket Playing XI or football formation).

> Master plan: [`docs/build-plan.md`](docs/build-plan.md). Data model:
> [`docs/schema.prisma`](docs/schema.prisma). Lineups:
> [`docs/lineup-design.md`](docs/lineup-design.md). Real-time/bidding:
> `docs/architecture.md` *(pending)*.

## Stack

- **Server:** Node 20 + Express + TypeScript (strict) + Prisma + Socket.io · MySQL 8
- **Client:** Vite + React + TypeScript (strict) + React Router · Tailwind v4 (shadcn/ui)
- **Money:** `Decimal(14,4)` in crore units — never a JS `number`.

## Getting started

```bash
# 1. install all workspaces
npm install

# 2. create your env file
cp .env.example .env      # then edit DATABASE_URL etc.

# 3. run server (:4000) + client (:5173) together
npm run dev
```

Visit http://localhost:5173 — the page should show `server: ok · sports-auction-platform`.

## Scripts (root)

| Script | Action |
|---|---|
| `npm run dev` | server + client together (concurrently) |
| `npm run build` | build server then client |
| `npm run typecheck` | strict typecheck both workspaces |
| `npm run lint` | ESLint across the repo |
| `npm run format` | Prettier write |
| `npm test` | server tests (Vitest) |

## Layout

```
docs/      specs (build plan, schema, lineup design, architecture)
server/    Express + Prisma + Socket.io API
client/    Vite + React SPA
uploads/   runtime file storage (gitignored)
```

## Build status

Phase 0 (repo & tooling) complete. See `docs/build-plan.md` §9 for the phase roadmap.
