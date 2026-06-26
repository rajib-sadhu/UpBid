# Auction App — TODO / phase tracker

## Done
- **Phase 0** — Repo & tooling (workspaces, TS strict, ESLint/Prettier, CI stub).
- **Phase 1** — Database & Prisma (schema, initial migration, seed: super admin + 6 formations).
- **Phase 2** — Auth & user hierarchy (login, JWT, requireRole/requireOwnership, organizer/franchise creation, route guards).
- **Hardening pass** — password eye toggle, malformed-JSON 400, case-insensitive email,
  `/api` 404 JSON, helmet, login rate-limit, login enumeration fix, create-user success UX.
- Production single-server SPA serving.

## Phase 3 — Core CRUD ✅ (awaiting review)
Schema already migrated in Phase 1 → no DB migration needed.

- [x] Shared Zod schemas + DTOs: sports, pagination, leagues, seasons, players (+ ban).
- [x] Multer upload config → `/uploads`, served statically; CORP set for cross-origin images.
- [x] Leagues module: CRUD, organizer-scoped list, ownership gates (super-admin bypass).
- [x] Seasons module: CRUD nested under a league (ownership via parent league).
- [x] Players module: global CRUD, list/search/pagination, photo upload.
- [x] Per-league ban toggle (`PlayerLeagueStatus`) + league-players list with ban flag.
- [x] Client: Players page, Leagues list, League detail (seasons + ban toggle), nav, routes.
- [x] Verify: typecheck + lint clean; 33/33 API assertions; visual test; mobile overflow fixed.

## Phase 4 — Auction setup ✅ (awaiting review)
No schema change. Auction config is mutable only while DRAFT; go-live transition gated.

- [x] Auctions: create/list under a season, get/update/delete (DRAFT-only mutations).
- [x] AuctionRules (credit, min/max players, min/max teams, unsold price, lot timer) — upsert + validation.
- [x] BidIncrementTier — replace-set with unique-threshold validation.
- [x] LineupRules — cricket toggles / football bench / overseas cap (conditional).
- [x] Teams — assign global FRANCHISE owners, logo upload, unique per auction, delete.
- [x] Allowed football formations (set/replace) + global formations list endpoint.
- [x] Lot list — add/remove with base price + isOverseas; available-players **excludes banned** + other sports + existing lots.
- [x] biddingMode toggle; go-live gated on rules + ≥1 lot + minTeams≤#teams≤maxTeams; config locks once LIVE.
- [x] Client: SeasonDetailPage (auctions), AuctionSetupPage + section cards, routes, nav.
- [x] Verify: typecheck + lint clean; 29/29 API assertions; full visual setup→go-live flow.

## Phase 5 + 6 — Live auction, re-auction & assignment ✅ (awaiting review)
No schema change (used existing fields). `docs/architecture.md` authored first
(timer freeze-on-expiry, event protocol, reserve math, state machine) and locked
with the user (anti-snipe off; freeze→organizer decides; LOT_REOPEN deferred).

- [x] Shared realtime contracts (`shared/src/realtime.ts`): event names, Zod
      payloads, snapshot/delta DTOs + new bid/assignment error codes.
- [x] Reserve math service (`services/reserve.ts`) — pure maxBid/increment, 12 unit tests.
- [x] Bid pipeline (`services/bid-pipeline.ts`): 7-step gauntlet, optimistic CAS
      on `AuctionPlayer.version`; both bidding modes; idempotent `clientBidId`.
- [x] Finalize (SELL/UNSOLD), assignment (CHOSEN/FORCE_ASSIGNED), phase machine
      (LIVE⇄PAUSED, →RE_AUCTION reset-unsold, →ASSIGNMENT, →COMPLETED gate).
- [x] Timer registry: freeze-on-expiry (no auto-finalize/advance), pause/resume,
      add-time, crash-safe sweep + boot recovery.
- [x] Socket gateway: JWT handshake, room join authZ, snapshot + seq deltas,
      all handlers; wired into `index.ts`. Go-live now also requires ≥1 bid tier.
- [x] Client: `useAuctionRoom` (snapshot + seq-ordered deltas + re-snapshot on
      gap/reconnect), live auction screen (current lot, teams board, bid controls
      per mode, organizer controls, lot queue, assignment panel), routes (franchise
      allowed), dashboard "my auctions" entry, setup→live link, `/api/auctions/mine`.
- [x] Concurrency test proves no double-accept (CAS) + stale-version rejection.
- [x] Verify: typecheck + lint clean; 14/14 tests; full build (server + client) green.

> ⚠️ Live behaviour not yet exercised against MySQL/Socket.io in this session
> (no DB available here) — run `npm run dev` against the DB to smoke-test the flow.

## Phase 7 — Lineups ✅ (awaiting review)
No schema change (used existing Lineup/LineupMember/LineupRules/Formation models).

- [x] Shared contracts (`shared/src/lineups.ts`): statuses/memberships, the full
      LINEUP_VIOLATIONS code list, saveLineupSchema (Zod), builder + save DTOs.
- [x] Pure validator (`services/lineup-validator.ts`) implementing every cricket +
      football + shared rule from lineup-design.md. **22 unit tests** — every
      documented error code fires, valid lineups pass, allowed overlaps allowed.
- [x] Lineups module (`modules/lineups`): GET/PUT `/api/teams/:teamId/lineup`,
      POST lock/unlock. Ownership + edit policy (owner edits unless LOCKED &&
      !editableAfterLockByOwner; organizer/admin always; lock = organizer only),
      auction-COMPLETED gate, squad-integrity guard, save-then-validate, lock
      refused with violations on non-empty. Mounted `/api/teams`.
- [x] Client builder (`features/lineups/LineupPage.tsx`): cricket (membership,
      batting order, role toggles) + football (formation, slot assignment, bench,
      C/VC) builders, live violation list, save / lock / unlock. Route
      `/teams/:teamId/lineup` (all roles); links from the live page when COMPLETED.
- [x] Verify: typecheck + lint clean; 36/36 tests; full build green.

> ⚠️ Not yet exercised end-to-end against MySQL (no DB in session) — run
> `npm run dev` to smoke-test build → lock.

## Later
- Phase 8 — Dashboards & tracking. Phase 9 — Hardening. Phase 10 — Deploy.
