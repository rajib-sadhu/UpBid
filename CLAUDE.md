# Auction App — project instructions

Multi-sport, IPL-style **live player-auction platform**: organizers run live English
auctions where teams bid for players under a credit budget, then teams build and lock
post-auction lineups (cricket Playing XI / football formation).

## ⚠️ Stack override (deviates from global default)

This project does **NOT** use the global Neocore (PHP) + NeoUI stack. Per the master
build plan (`docs/build-plan.md` §11, decisions locked), it uses:

- **Server:** Node + Express + TypeScript (strict) + Prisma + Socket.io, MySQL.
- **Client:** Vite + React + TypeScript (strict) + React Router, shadcn/ui + Tailwind.
- **Validation:** Zod (server + react-hook-form on client).
- **Auth:** JWT (Bearer header + Socket.io handshake). Passwords hashed with
  **`bcryptjs`** (pure-JS; produces standard `$2b$` hashes — swapped from native
  `bcrypt` to drop a vulnerable native build chain) + a server-wide `PEPPER`. No email —
  parent role provisions child accounts directly with a password; accounts start `ACTIVE`.
- **Money:** `Decimal(14,4)` in **crore units**. Never parse money into a JS `number` —
  `Prisma.Decimal` / `decimal.js` on the server, strings on the wire.

This was confirmed with the user on 2026-06-24.

## Source of truth (read before coding; re-read per phase)

- `docs/schema.prisma` — complete data model. **Authoritative; use verbatim.**
- `docs/lineup-design.md` — lineup model + exact per-sport validation rules + error codes.
- `docs/architecture.md` — real-time/Socket.io design, server-authoritative bidding,
  reserve math, auction state machine. **⚠️ NOT YET PROVIDED — required before Phase 5.**
- `docs/build-plan.md` — the master phased plan.

## Working rules (from the build plan)

- Build **phase by phase** (`docs/build-plan.md` §9). After each phase: run migrations,
  typecheck, run tests, then **stop for review**. Do not scaffold future phases early.
- **Never change the schema silently.** If a change is needed, flag it and update
  `docs/schema.prisma` in the same commit.
- Invariants in build-plan §6–8 are non-negotiable. The reserve math and the lineup
  validators are mandatory unit-test targets.

## Repo layout

`/server` (Express+Prisma+Socket.io) · `/client` (Vite+React) · `/docs` (specs) ·
`/uploads` (runtime file storage, gitignored). npm workspaces; root scripts run both
sides via `concurrently`.

## Commands

- `npm install` — install all workspaces.
- `npm run dev` — start server (port 4000) + client (port 5173) together.
- `npm run typecheck` / `npm run lint` / `npm run format` / `npm test`.
