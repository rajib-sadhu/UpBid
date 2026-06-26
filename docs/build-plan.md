# Sports Auction Platform — Build Plan

> Hand this file to **Claude Code** as the master plan for the project.

---

## 0. How to use this document (read first)

You are building a **multi-sport player-auction web application** (IPL-style): organizers run live English auctions where teams bid for players under a credit budget, then teams build and lock their post-auction lineups.

This file is your master plan. **Three companion spec files live in `/docs` and are the source of truth** — read them before writing code, and re-read the relevant one at the start of each phase:

- `docs/schema.prisma` — the complete data model. **Authoritative.** Use it as the Prisma schema verbatim.
- `docs/architecture.md` — real-time / Socket.io design, server-authoritative bidding, the credit-reserve math, and the auction phase state machine.
- `docs/lineup-design.md` — the post-auction lineup model and the exact per-sport validation rules.

Working rules:
- Build **phase by phase** (Section 9). After each phase: run migrations, typecheck, run tests, then **stop for review** before the next phase. Do not scaffold future phases early.
- Make small, reviewable commits per task.
- **Never change the schema silently.** If a change is needed, call it out and update `docs/schema.prisma` in the same commit.
- The invariants in Sections 6–8 are non-negotiable; if anything you write would violate them, stop and flag it.

---

## 1. Project overview

**Roles (hierarchy).** `SUPER_ADMIN` → creates `ORGANIZER`s and can do/track/edit everything any organizer can. `ORGANIZER` → creates leagues, seasons, players, auctions, franchises/teams; sets all rules; runs the auction; manages and locks lineups. `FRANCHISE` → edits its own team, bids live, and builds its own lineup.

**Core flow.** League → Season → Auction. The organizer adds franchises/teams **per auction**, sets rules (credit, min/max players, min/max teams, base prices, bid-increment tiers, unsold price), and builds the lot list. The auction runs one player at a time (English auction). Unsold players go to a re-auction; teams short of the minimum then choose players or are force-assigned at the unsold price. After the auction completes, each team builds a lineup (cricket Playing XI with roles + batting order, or a football formation with benches) which is validated and locked.

**Both bidding modes** and **both sports' lineups** are in scope for v1.

---

## 2. Tech stack & conventions

- **Repo:** one repository — `/server`, `/client`, `/docs`, root scripts.
- **Server:** Node + Express + TypeScript (strict) + Prisma + Socket.io.
- **Client:** Vite + React + TypeScript (strict) + React Router.
- **Validation:** Zod on the server; Zod + react-hook-form on the client. Share request/response Zod schemas via a small `/shared` folder or a `packages` dir if convenient.
- **UI:** shadcn/ui + Tailwind. Clean, dense, dashboard-style; the live auction screen is the centerpiece.
- **DB:** MySQL (self-hosted), Prisma ORM, foreign keys on. Use `docs/schema.prisma` as-is.
- **Money:** `Decimal(14,4)` in **crore units**. Handle as `Prisma.Decimal` / `decimal.js` on the server and as strings on the wire — **never** parse money into a JS `number`.
- **Auth:** JWT access token in the `Authorization: Bearer` header; Socket.io auth via `handshake.auth.token`. Passwords hashed with **bcrypt**. **No email** — a parent role creates a child account directly with an email + initial password; the account is `ACTIVE` immediately. Leave the `inviteToken`/`invitedAt` fields unused for now.
- **Authorization:** middleware enforcing role + resource ownership. A franchise may only act on its own team/lineup; `SUPER_ADMIN` bypasses ownership and can edit any resource.
- **Errors:** typed responses `{ code: string, message: string, details?: unknown }`. Bid and lineup validation must return the **stable error codes** defined in the specs.
- **Uploads:** team logos and player photos saved to a local `/uploads` folder via **multer**; Express serves it statically; store the relative path in the DB.
- **Testing:** Vitest for unit/integration (mandatory coverage of the bid reserve math and the lineup validators), Playwright for 2–3 e2e happy paths. GitHub Actions CI: install → typecheck → test.
- **Tooling:** ESLint + Prettier; npm scripts at the root to run server and client together (e.g. `concurrently`).

---

## 3. Suggested repo structure

```
/
├─ docs/                  # schema.prisma, architecture.md, lineup-design.md (the spec)
├─ server/
│  ├─ prisma/             # schema.prisma (copy of docs), migrations, seed.ts
│  ├─ src/
│  │  ├─ index.ts         # express + http + socket.io bootstrap
│  │  ├─ env.ts
│  │  ├─ auth/            # jwt, bcrypt, middleware (requireRole, requireOwnership)
│  │  ├─ modules/         # one folder per domain: users, leagues, seasons,
│  │  │                   #   players, auctions, rules, teams, bids, lineups
│  │  ├─ realtime/        # socket gateway, rooms, event handlers, bid pipeline
│  │  ├─ services/        # reserve math, lineup validators, auction state machine
│  │  ├─ uploads/         # multer config (writes to /uploads)
│  │  └─ lib/             # prisma client, decimal helpers, errors
│  └─ tests/
├─ client/
│  ├─ src/
│  │  ├─ main.tsx, App.tsx, router
│  │  ├─ api/             # typed fetch client
│  │  ├─ socket/          # socket client + hooks (useAuctionRoom)
│  │  ├─ components/ui/   # shadcn
│  │  ├─ features/        # auth, admin, organizer, auction-live, lineups, teams
│  │  └─ lib/
│  └─ tests/
├─ uploads/               # runtime file storage (gitignored)
├─ .github/workflows/ci.yml
└─ package.json           # root scripts
```

---

## 4. Roles & access (v1)

- `SUPER_ADMIN`: god-mode. Creates organizers; can view, edit, and track every league/season/player/auction/team/lineup across the system. Bypasses ownership checks.
- `ORGANIZER`: owns the leagues they create and everything beneath them.
- `FRANCHISE`: global account, assigned to one team per auction; edits own team details, bids in franchise-live mode, builds own lineup.
- **Account creation:** the creating role sets email + initial password directly; status = `ACTIVE`. No email sending.
- Every mutating endpoint and socket event runs through role + ownership authorization.

---

## 5. Data model & seed

- Copy `docs/schema.prisma` into `server/prisma/schema.prisma`, generate the client, and create the initial migration.
- **Seed script (`seed.ts`):**
  - Create one `SUPER_ADMIN` from env vars `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
  - Seed standard football `Formation` rows: `4-4-2`, `4-3-3`, `3-5-2`, `4-2-3-1`, `5-3-2`, `4-5-1` (each with the correct GK/DEF/MID/FWD counts summing to 11).

---

## 6. Real-time & bidding — invariants (full detail in `architecture.md`)

- One Socket.io room per auction: `auction:{auctionId}`. State is **public** — every participant (organizer, all franchises, spectators) joins the same room and sees all teams' credit and squads.
- JWT verified on socket connect; role gates inbound events. On join, the server sends a full `STATE_SNAPSHOT`; clients apply deltas thereafter and re-snapshot on reconnect.
- **Server is authoritative for every bid.** Clients propose; the server decides. Run each `BID_PLACE` through: authZ → lot is live and within the timer → amount equals `currentPrice + requiredIncrement(currentPrice)` → team under `maxPlayersPerTeam` → reserve/budget check → atomic commit → broadcast.
- **Concurrency:** use optimistic compare-and-set on `AuctionPlayer.version` (`UPDATE ... WHERE id = ? AND version = ? AND status = 'ON_BLOCK'`); 0 rows affected ⇒ reject (`OUTBID`/`STALE_VERSION`). Dedupe on `clientBidId`. Write it Redis-adapter-ready but run a single instance for now.
- **Reserve math (implement exactly):**
  ```
  maxBid = creditPerTeam - committedAmount
                         - max(0, minPlayersPerTeam - (playerCount + 1)) * unsoldPrice
  accept bid B  ⟺  B <= maxBid  AND  playerCount < maxPlayersPerTeam
  ```
  Unit-test against the worked example in `architecture.md` (100 credit, minP 12, unsold 0.5 → 7th-player max bid = 0.5).
- **Both bidding modes** (toggle `Auction.biddingMode`):
  - `FRANCHISE`: each franchise client emits bids for its own team (ownership enforced).
  - `ORGANIZER`: only the organizer emits bids, choosing the team and amount on a team's behalf; franchise clients are view-only. Same validation pipeline; `bidderUserId` = organizer, `teamId` = the chosen team.
- **Timer is server-authoritative:** set `currentLotEndsAt` when a lot goes `ON_BLOCK`; clients render from `endsAt`; a server-side job finalizes the lot at expiry (`SOLD` to the leader, else `UNSOLD`). The organizer can finalize early. Pause stores remaining time; resume restores it.

---

## 7. Auction lifecycle & assignment (detail in `architecture.md` §8)

`DRAFT → LIVE/MAIN → RE_AUCTION → ASSIGNMENT → COMPLETED`, all transitions organizer-driven.
- Going `LIVE` requires `minTeams ≤ #teams ≤ maxTeams`.
- Banned players (per-league via `PlayerLeagueStatus`) are excluded when building the lot list.
- After the main round, unsold lots reset to `PENDING` for the re-auction round.
- In assignment, teams below `minPlayersPerTeam` choose remaining players or the organizer force-assigns them, at `unsoldPrice`; record `acquiredVia` and the price. Complete only when every team meets its minimum.

---

## 8. Lineups (detail in `lineup-design.md`)

- A lineup is created **after the auction is `COMPLETED`**, one per team, built by the franchise owner.
- **Validation runs on every save** and returns the stable error codes; the organizer can **lock** a lineup only when it has zero violations. The organizer can always edit; the owner can edit after lock only if `editableAfterLockByOwner` is true.
- **Cricket:** exactly `startingSize` starters; full 1..N batting order; required roles WK / captain / vice-captain / 1st bowler / 2nd bowler (each toggleable). Constraints: captain ≠ vice-captain; 1st bowler ≠ 2nd bowler; **WK ≠ bowler**. Allowed overlaps: captain may also be WK or a bowler; vice-captain may also be WK or a bowler. Reserves are non-XI squad members (no bench).
- **Football:** organizer-permitted formation preset; exactly `startingSize` starters whose slot distribution matches the formation; **only the GK slot is locked** to a GK-position player, all outfield slots take any non-GK player; captain + vice-captain required and distinct; organizer-set bench size; rest are reserves.
- **Overseas cap** (both sports, if enabled): overseas starters (`AuctionPlayer.isOverseas`) must not exceed `maxOverseasInXI`, counted within the starting XI.

---

## 9. Phased build plan

> After every phase: `prisma migrate`, typecheck, run tests, then stop for review.

### Phase 0 — Repo & tooling
**Tasks:** init the repo structure (§3); TypeScript strict on both sides; ESLint/Prettier; root scripts to run server + client; `.env.example`; gitignore `/uploads`, `node_modules`, build output; stub CI.
**Done when:** `npm run dev` starts a hello-world Express server and the Vite client; CI runs typecheck on a clean checkout.

### Phase 1 — Database & Prisma
**Tasks:** copy `docs/schema.prisma` into `server/prisma`; generate client; initial migration; write `seed.ts` (super admin + football formations); Prisma client singleton + Decimal helpers.
**Done when:** migration applies to a fresh MySQL DB and the seed creates the admin and six formations.

### Phase 2 — Auth & user hierarchy
**Tasks:** login (email + password, bcrypt, JWT); auth middleware; `requireRole` and `requireOwnership`; super-admin creates organizers; organizer creates franchise users; "me" endpoint; client auth (login page, token storage in memory + refresh-on-load strategy, route guards by role).
**Done when:** all three roles can log in; an organizer can create a franchise; RBAC blocks cross-role and cross-owner access; super admin bypasses ownership.

### Phase 3 — Core CRUD
**Tasks:** leagues, seasons, players (global, with `footballPosition` for football), per-league ban toggle (`PlayerLeagueStatus`); multer uploads for team logos / player photos served from `/uploads`; basic list/search/pagination; organizer + admin UIs.
**Done when:** an organizer can create a league → season → players, ban/unban a player in a league, and upload images; a banned player is flagged for exclusion.

### Phase 4 — Auction setup
**Tasks:** create auction under a season; `AuctionRules` (credit, min/max players, min/max teams, unsold price, default lot duration); `BidIncrementTier`s; `LineupRules`; add franchises/teams to the auction (assign global franchise users); set `isOverseas` flags; allowed football formations; build the lot list (`AuctionPlayer` with base prices, **excluding banned players**); set `biddingMode`.
**Done when:** an organizer can fully configure an auction in `DRAFT` and the lot list excludes banned players; going `LIVE` is gated on the team-count rule.

### Phase 5 — Live auction (real-time)
**Tasks:** Socket.io gateway + auth + rooms + `STATE_SNAPSHOT`; the event protocol from `architecture.md`; server-authoritative timer + lot-close job; bid pipeline with the reserve math and optimistic concurrency; **both bidding modes**; sold/unsold/next-player; pause/resume; the live auction client screen (current lot, live price/leader, all teams' credit + squads, bid controls per mode, countdown).
**Done when:** a lot can be put on the block, bid up live by multiple franchises (and by the organizer in organizer mode), and sold to the leader at timer expiry; simultaneous bids never double-accept; the reserve check caps bids correctly.

### Phase 6 — Re-auction & assignment
**Tasks:** advance to `RE_AUCTION` (reset unsold lots) and re-run; `ASSIGNMENT` phase — teams below minimum choose players, organizer force-assigns at `unsoldPrice`; min-player enforcement; complete the auction.
**Done when:** unsold players re-auction; every team reaches `minPlayersPerTeam` via choice or force-assignment; the auction completes.

### Phase 7 — Lineups
**Tasks:** lineup builder UI for both sports; the cricket and football validators (services, fully unit-tested against `lineup-design.md`); save-with-validation returning error codes; organizer lock/override + edit policy; overseas-cap enforcement.
**Done when:** a franchise can build a valid XI/formation, every documented error code fires on the matching invalid input, and the organizer can lock only a valid lineup.

### Phase 8 — Dashboards & tracking
**Tasks:** super-admin global views (browse/edit any league/auction/team/lineup); organizer auction monitor (live status, per-team spend, squads); franchise team view; read models for spectators.
**Done when:** the super admin can inspect and edit anything; the organizer has a live overview of an in-progress auction.

### Phase 9 — Hardening
**Tasks:** complete the test suite (reserve math, both validators, concurrency simulation of simultaneous bids, an auction lifecycle integration test); Playwright happy paths (login → run a tiny auction → build a lineup); error-handling and edge-case polish; finalize CI.
**Done when:** tests pass in CI; the concurrency test proves no double-accept; the e2e flow is green.

### Phase 10 — Build & deploy
**Tasks:** production build of the client; Express serves the built SPA plus `/api`, `/uploads`, and Socket.io from the single Node server; env config; run migrations on deploy; document start commands (e.g. PM2) for the user's Node server.
**Done when:** a single-command production start serves the app end to end against the self-hosted MySQL and persists uploads to `/uploads`.

---

## 10. Overall done criteria

- All three roles work with correct RBAC; super admin is god-mode.
- An organizer can configure and run a complete auction in **both** bidding modes, with server-authoritative bids, correct reserve math, and safe simultaneous-bid handling.
- The unsold → re-auction → assignment flow guarantees every team meets its minimum.
- Both cricket and football lineups validate per spec (every error code reachable) and can be locked.
- Money is exact (Decimal, never float); images persist to `/uploads`; the app builds and runs on the user's Node server with MySQL.
- Reserve math and lineup validators are unit-tested; a concurrency test and an e2e happy path pass in CI.

---

## 11. v1 decisions locked (do not re-litigate)

- Single repo; Vite/React SPA + Express + Socket.io; self-hosted MySQL + Prisma with FKs.
- TypeScript strict throughout; Zod + react-hook-form; shadcn/ui + Tailwind.
- JWT (Bearer + socket handshake), bcrypt; **no email** — parent role creates child accounts with a password; accounts start `ACTIVE`.
- Super admin can do, track, and edit everything.
- Both bidding modes; both sports' lineups.
- Money in crore units as `Decimal(14,4)`.
- Uploads to a local `/uploads` folder; production serves SPA + API + uploads + Socket.io from one Node server.
- Single real-time instance, written Redis-adapter-ready.
- Overseas cap counted within the starting XI.
- `docs/schema.prisma` is the source of truth for the data model.
