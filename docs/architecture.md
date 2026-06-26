# Architecture — Real-time auction engine (Phase 5 source of truth)

> Companion to `build-plan.md` (§6–7) and `schema.prisma`. This document is the
> authoritative spec for the Socket.io layer, the server-authoritative bid
> pipeline, the credit-reserve math, the lot timer, and the auction state
> machine. Phase 5/6 code derives from this file. Where this file restates a
> build-plan invariant, the build plan wins on conflict — flag any discrepancy.

---

## 1. Principles

1. **Server is the only authority.** Clients _propose_; the server _decides_.
   No client-supplied price, increment, leader, timer, or credit figure is ever
   trusted. The client renders what the server broadcasts.
2. **State is public.** Every participant (organizer, all franchises,
   spectators) joins one room per auction and sees every team's credit and
   squad. There are no private rooms or per-team channels.
3. **Money is exact.** All amounts are `Prisma.Decimal` (crore units) on the
   server and **strings** on the wire (`moneyToWire`, 4 dp). Never a JS `number`.
   The reserve math runs entirely through `server/src/lib/money.ts`.
4. **Single instance now, Redis-adapter-ready later.** One Node process; no
   sticky-session assumptions baked into application logic. Room names and event
   payloads are adapter-agnostic so a `@socket.io/redis-adapter` drop-in works
   without protocol changes.
5. **The DB is the source of truth for durable state; the broadcast is a
   projection of a committed transaction.** We never broadcast an outcome we
   have not committed.

---

## 2. Transport, namespace, rooms

- Default namespace `/` (no custom namespace in v1).
- **One room per auction:** `auction:{auctionId}`. Joining requires a valid JWT
  whose user is entitled to _view_ that auction (see §3). Everyone who can view
  joins the same room.
- The server keeps **no authoritative state in memory** beyond timers (§7).
  Connection/room membership is the only socket-layer state; all auction state
  is read from / written to MySQL via Prisma.

---

## 3. Authentication & authorization

### Handshake

- Client connects with `io(url, { auth: { token } })`.
- A Socket.io middleware (`io.use(...)`) reads `socket.handshake.auth.token`,
  runs the **existing** `verifyToken()` (`server/src/auth/jwt.ts`), and attaches
  `socket.data.user = { id, role }` (same shape as `AuthUser`). Failure →
  `next(new Error("UNAUTHENTICATED"))`, which rejects the connection.
- No token refresh over the socket. On JWT expiry the client reconnects with a
  fresh token (obtained via the existing REST auth flow).

### Join authorization (`AUCTION_JOIN`)

On `AUCTION_JOIN { auctionId }` the server verifies **view** entitlement:

- `SUPER_ADMIN` → always.
- `ORGANIZER` → must own the auction (`auctionOwnerId(auctionId) === user.id`,
  reusing `auctions.service.ts`).
- `FRANCHISE` → must own a `Team` in that auction
  (`Team.auctionId = auctionId AND Team.ownerUserId = user.id`).
- Anyone else / not entitled → emit `ERROR { code: "FORBIDDEN" }`, do not join.

Spectator access is **not** in v1 (no public/anonymous viewers); revisit later.
"Public state" means _public to all entitled participants_, not unauthenticated.

### Action authorization (per inbound event)

Every state-changing event re-checks role + ownership **server-side**, every
time — never relying on the join check alone:

- **Organizer-only control events** (lot control, timer, phase, force-assign):
  caller must be the auction owner (or `SUPER_ADMIN`).
- **`BID_PLACE`** depends on `biddingMode` (§8).

---

## 4. State snapshot & deltas

- On successful `AUCTION_JOIN`, the server emits one **`STATE_SNAPSHOT`** to the
  joining socket only — the complete, current auction state (below).
- Thereafter the server broadcasts **deltas** to the room as events occur
  (`LOT_OPENED`, `BID_ACCEPTED`, `LOT_SOLD`, …).
- **Reconnect = re-snapshot.** On any reconnect the client re-emits
  `AUCTION_JOIN` and replaces local state with the fresh `STATE_SNAPSHOT`. The
  client never tries to replay missed deltas; the snapshot is always
  authoritative. Each broadcast carries a monotonically increasing `seq` (§4.1)
  so a client can detect a gap and force a re-snapshot.

### `STATE_SNAPSHOT` shape (money fields are strings)

```jsonc
{
  "seq": 128,
  "auction": {
    "id": "...",
    "name": "...",
    "status": "LIVE",
    "round": "MAIN",
    "biddingMode": "FRANCHISE",
  },
  "rules": {
    "creditPerTeam": "100.0000",
    "minPlayersPerTeam": 12,
    "maxPlayersPerTeam": 25,
    "unsoldPrice": "0.5000",
    "defaultLotDurationSec": 30,
  },
  "incrementTiers": [
    { "fromAmount": "0.0000", "increment": "0.1000" },
    { "fromAmount": "2.0000", "increment": "0.2500" },
  ],
  "teams": [
    {
      "id": "...",
      "name": "...",
      "shortName": "...",
      "logoUrl": "...",
      "ownerUserId": "...",
      "committedAmount": "37.5000",
      "playerCount": 6,
      "maxBid": "60.0000", // server-computed reserve cap for THIS team
    },
  ],
  "currentLot": {
    // null when no lot is on the block
    "auctionPlayerId": "...",
    "playerId": "...",
    "playerName": "...",
    "photoUrl": "...",
    "isOverseas": true,
    "basePrice": "2.0000",
    "status": "ON_BLOCK",
    "round": "MAIN",
    "currentPrice": "5.2500", // null before first bid → next bid = basePrice
    "leadingTeamId": "...", // null before first bid
    "requiredNextBid": "5.5000", // server-computed: currentPrice + increment, or basePrice
    "version": 14,
    "timerState": "BIDDING", // BIDDING | FROZEN | PAUSED (§7)
    "endsAt": "2026-06-26T12:00:30.000Z", // server clock; null when FROZEN/PAUSED
    "remainingMs": null, // set only when PAUSED
  },
  "lots": {
    // lightweight roster of all lots for the board
    "counts": { "PENDING": 40, "ON_BLOCK": 1, "SOLD": 12, "UNSOLD": 3, "ASSIGNED": 0 },
  },
  "serverTime": "2026-06-26T12:00:05.000Z", // for client clock-skew correction
}
```

> `maxBid` and `requiredNextBid` are **derived** server-side and included for
> display only. The server recomputes them authoritatively on every `BID_PLACE`;
> the client uses them purely to enable/disable the bid button and show hints.

### 4.1 Sequence numbers

- Per-auction in-memory counter, seeded from a `STATE_SNAPSHOT` build. Every
  room broadcast includes `seq`. Clients store the last `seq`; on a gap
  (`incoming.seq !== last + 1`) they re-`AUCTION_JOIN`. The counter is advisory
  (correctness still comes from snapshot-on-reconnect); it just makes gaps cheap
  to detect. **Note:** on a multi-instance Redis deployment this counter must
  move to Redis `INCR` — flagged for the scale-out work, not built now.

---

## 5. Event protocol

Naming: `SCREAMING_SNAKE_CASE`. Client→server events end with a verb
(`BID_PLACE`); server→client events are past-tense facts (`BID_ACCEPTED`).
Every client→server event may carry a `clientBidId`/`clientEventId` for
idempotency where noted. Every server→client broadcast carries `seq`.

### Client → server

| Event             | Payload                                                                | Auth                                         | Effect                                                                     |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| `AUCTION_JOIN`    | `{ auctionId }`                                                        | view                                         | join room, receive `STATE_SNAPSHOT`                                        |
| `AUCTION_LEAVE`   | `{ auctionId }`                                                        | —                                            | leave room                                                                 |
| `BID_PLACE`       | `{ auctionId, auctionPlayerId, teamId, amount, version, clientBidId }` | bid (§8)                                     | run bid pipeline (§6)                                                      |
| `LOT_OPEN`        | `{ auctionId, auctionPlayerId }`                                       | organizer                                    | put a `PENDING` lot `ON_BLOCK`, start timer                                |
| `LOT_SELL`        | `{ auctionId, auctionPlayerId }`                                       | organizer                                    | finalize SOLD to current leader (`NO_LEADER` if none)                      |
| `LOT_MARK_UNSOLD` | `{ auctionId, auctionPlayerId }`                                       | organizer                                    | finalize UNSOLD                                                            |
| `TIMER_ADD`       | `{ auctionId, seconds }`                                               | organizer                                    | (re)start the lot clock; reopens a `FROZEN` lot                            |
| `TIMER_PAUSE`     | `{ auctionId }`                                                        | organizer                                    | freeze the active lot timer (PAUSED)                                       |
| `TIMER_RESUME`    | `{ auctionId }`                                                        | organizer                                    | resume with stored remaining time                                          |
| `PHASE_ADVANCE`   | `{ auctionId, to }`                                                    | organizer                                    | state-machine transition (§9)                                              |
| `ASSIGN_PLAYER`   | `{ auctionId, auctionPlayerId, teamId }`                               | organizer (force) / franchise owner (choose) | ASSIGNMENT phase: assign a remaining player at `unsoldPrice` (§9, Phase 6) |

> `amount` and `version` in `BID_PLACE` make the bid a **compare-and-set**: the
> client asserts "I am raising version N to `amount`". A stale version loses (§6).

### Server → client (broadcast to room unless noted)

| Event               | Payload (money = strings)                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STATE_SNAPSHOT`    | full state (§4) — **to the joining socket only**                                                                                                                                   |
| `LOT_OPENED`        | `{ seq, currentLot }` (same shape as snapshot's `currentLot`)                                                                                                                      |
| `BID_ACCEPTED`      | `{ seq, auctionPlayerId, currentPrice, leadingTeamId, version, endsAt, requiredNextBid, bid: { teamId, bidderUserId, amount, createdAt }, team: { id, committedAmount, maxBid } }` |
| `BID_REJECTED`      | `{ seq, clientBidId, code, message }` — **to the bidding socket only**                                                                                                             |
| `LOT_TIMER_EXPIRED` | `{ seq, auctionPlayerId }` — lot frozen, awaiting organizer decision                                                                                                               |
| `LOT_SOLD`          | `{ seq, auctionPlayerId, soldToTeamId, soldPrice, team: { id, committedAmount, playerCount, maxBid }, lotCounts }`                                                                 |
| `LOT_UNSOLD`        | `{ seq, auctionPlayerId, lotCounts }`                                                                                                                                              |
| `PLAYER_ASSIGNED`   | `{ seq, auctionPlayerId, teamId, price, acquiredVia, team: { id, committedAmount, playerCount, maxBid }, lotCounts }`                                                              |
| `TIMER_PAUSED`      | `{ seq, auctionPlayerId, remainingMs }`                                                                                                                                            |
| `TIMER_RESUMED`     | `{ seq, auctionPlayerId, endsAt }`                                                                                                                                                 |
| `PHASE_CHANGED`     | `{ seq, status, round }`                                                                                                                                                           |
| `ERROR`             | `{ code, message }` — **to the offending socket only**                                                                                                                             |

`BID_REJECTED` is distinct from `ERROR`: rejection is a _normal_ outcome of the
auction race (OUTBID/STALE_VERSION), addressed to one bidder with their
`clientBidId` so the client can reconcile its optimistic UI; `ERROR` is a
protocol/authz fault.

---

## 6. The bid pipeline (server-authoritative)

`BID_PLACE` runs this **ordered** gauntlet. The first failure short-circuits to
`BID_REJECTED` (or `ERROR` for authz). All money comparisons via `money.ts`.

1. **AuthZ** — caller may bid for `teamId` under the current `biddingMode` (§8).
   Fail → `ERROR { FORBIDDEN }`.
2. **Lot live** — `auctionPlayerId` is the auction's `currentAuctionPlayerId`,
   its `status = ON_BLOCK`, and `now < currentLotEndsAt` (not paused/expired).
   Fail → `BID_REJECTED { LOT_NOT_LIVE }`.
3. **Idempotency** — if a `Bid` with this `clientBidId` already exists for this
   lot, re-emit the prior accepted result (no double-apply). (`clientBidId` is
   unique per bidder attempt; client regenerates only for a genuinely new bid.)
4. **Amount correctness** — required amount is:
   - first bid on the lot (`currentPrice IS NULL`): `amount == basePrice`;
   - otherwise: `amount == currentPrice + requiredIncrement(currentPrice)`.
     Exact-match only (no "≥"). Fail → `BID_REJECTED { BAD_AMOUNT }`.
5. **Squad cap** — `team.playerCount < maxPlayersPerTeam`. Fail →
   `BID_REJECTED { TEAM_FULL }`.
6. **Reserve / budget** — `amount <= maxBid(team)` (§6.1). Fail →
   `BID_REJECTED { RESERVE_EXCEEDED }`.
7. **Atomic compare-and-set commit** (§6.2). 0 rows updated → another bid won
   the race → `BID_REJECTED { OUTBID }` (or `STALE_VERSION` if the version was
   behind). Success → write the `Bid` row, extend the timer if configured
   (anti-snipe, §7), bump `seq`, broadcast `BID_ACCEPTED`.

### 6.1 Reserve math (implement exactly)

```
requiredIncrement(currentPrice) =
    increment of the BidIncrementTier with the greatest fromAmount <= currentPrice

maxBid(team) =
    creditPerTeam
  - team.committedAmount
  - max(0, minPlayersPerTeam - (team.playerCount + 1)) * unsoldPrice

accept bid B  ⟺  B <= maxBid(team)  AND  team.playerCount < maxPlayersPerTeam
```

The `(playerCount + 1)` term reserves enough budget to still fill the squad to
`minPlayersPerTeam` at `unsoldPrice` **after** winning this lot.

**Worked example (unit-test anchor).** `creditPerTeam = 100`, `minPlayersPerTeam
= 12`, `unsoldPrice = 0.5`. A team that has already won **6** players for a total
`committedAmount = 97.0` is bidding on its **7th**:

```
reserve = max(0, 12 - (6 + 1)) * 0.5 = max(0, 5) * 0.5 = 2.5
maxBid  = 100 - 97 - 2.5 = 0.5
```

→ the 7th-player max bid is **0.5**. Additional anchors to unit-test:

- Empty team, first player: `maxBid = 100 - 0 - max(0,12-1)*0.5 = 100 - 5.5 = 94.5`.
- Team at `playerCount = 12` (minimum met): reserve term is `max(0, 12-13)*0.5 =
0`, so `maxBid = creditPerTeam - committedAmount` (full remaining credit).
- Bids are rejected the instant `amount > maxBid`, even if raw credit remains.

> ⚠️ **Confirm:** the build plan's one-liner ("7th-player max bid = 0.5") doesn't
> state the committed total; I reconstructed `committedAmount = 97.0` as the
> scenario that yields 0.5. If your intended worked example uses different
> numbers, correct them here before I write the test.

### 6.2 Concurrency — optimistic compare-and-set

The leading-state mutation is a single conditional `UPDATE` on `AuctionPlayer`:

```sql
UPDATE AuctionPlayer
   SET currentPrice = :amount, leadingTeamId = :teamId, version = version + 1
 WHERE id = :auctionPlayerId
   AND version = :expectedVersion
   AND status = 'ON_BLOCK'
```

- Executed via `prisma.auctionPlayer.updateMany({ where: { id, version, status:
"ON_BLOCK" }, data: { ... , version: { increment: 1 } } })`; `count === 0`
  ⇒ reject. This is the **sole** serialization point for competing bids — no
  table locks, no app-level mutex.
- The whole step-7 unit (CAS + `Bid` insert + timer extend) runs inside the
  per-request transaction (Prisma `$transaction`). Reads in steps 2/5/6 use the
  values fetched at the top of the transaction; the CAS in step 7 is what makes
  a stale read safe (it simply fails and the client retries with fresh state).
- `committedAmount`/`playerCount` are **not** touched on a bid — only at
  **finalize** (a sold lot), so a losing/overbid sequence never corrupts tallies.

---

## 7. Timer — server-authoritative, **freeze on expiry**

> **Decision (locked):** the timer hitting zero does **not** finalize the lot and
> **never** auto-advances to the next player. At zero the lot _freezes_ and the
> organizer takes over: Sell-to-leader, Mark-unsold, or Add-time. The auction
> only moves to the next player when the organizer explicitly opens it. This
> overrides the build-plan's "auto-finalize at expiry" wording (flagged here).

### Lot timer states (derived; **no schema change**)

A lot on the block is in one of three timer states, derived from
`AuctionPlayer.status = ON_BLOCK` + `Auction.currentLotEndsAt` + `Auction.status`

- an in-memory timer registry (the registry is the fast path; the DB fields make
  it crash-safe):

| State     | Condition                                                                                        | Bids?                                    |
| --------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `BIDDING` | `currentLotEndsAt > now`, auction `LIVE`                                                         | accepted                                 |
| `FROZEN`  | timer elapsed: `currentLotEndsAt IS NULL` (set null at expiry), auction `LIVE`                   | rejected (`LOT_NOT_LIVE`) until Add-time |
| `PAUSED`  | organizer paused mid-bidding: `currentLotEndsAt IS NULL`, auction `PAUSED`, `remainingMs` stored | rejected until Resume                    |

`FROZEN` vs `PAUSED` are distinguished by `Auction.status` (LIVE vs PAUSED).

### Mechanics

- **Open** (`LOT_OPEN`): set `currentAuctionPlayerId`, `status = ON_BLOCK`,
  `currentLotEndsAt = now + defaultLotDurationSec*1000`; arm an in-memory
  `setTimeout` keyed by `auctionId` (registry entry `{ auctionPlayerId, state:
BIDDING }`). Broadcast `LOT_OPENED`.
- **Countdown**: clients render from `endsAt` (skew-corrected by `serverTime`).
  Cosmetic only — the server timeout is authoritative.
- **Expiry → FREEZE**: on timeout the server sets `currentLotEndsAt = null`,
  registry `state = FROZEN`, bumps `seq`, broadcasts **`LOT_TIMER_EXPIRED { auctionPlayerId }`**.
  It does **not** finalize and does **not** open the next lot. Bids are now
  rejected with `LOT_NOT_LIVE`.
- **No anti-snipe**: `endsAt` is set once at `LOT_OPEN` and is never extended by
  a bid. (Locked: no extension.)
- **Add time** (`TIMER_ADD { seconds }`, organizer): from `FROZEN` (or
  `BIDDING`) set `currentLotEndsAt = now + seconds*1000`, registry `state =
BIDDING`, re-arm the timeout, broadcast `TIMER_RESUMED`. This is how the
  organizer reopens bidding on a frozen lot.
- **Pause/resume** (during `BIDDING`): `TIMER_PAUSE` clears the timeout, stores
  `remainingMs = endsAt - now`, sets `currentLotEndsAt = null` + auction
  `PAUSED`, broadcasts `TIMER_PAUSED`. `TIMER_RESUME` sets `currentLotEndsAt =
now + remainingMs`, auction `LIVE`, re-arms, broadcasts `TIMER_RESUMED`.
- **Finalize is always explicit (organizer)** — there is no automatic finalize:
  - `LOT_SELL` → sell to the current leader. Error `NO_LEADER` if no bid exists.
  - `LOT_MARK_UNSOLD` → mark unsold.
    Both run the finalize transaction below and may be issued in `BIDDING`,
    `FROZEN`, or `PAUSED`.
- **Crash safety**: a periodic sweep marks any `ON_BLOCK` lot whose `endsAt`
  has elapsed but isn't in the registry as `FROZEN` (e.g. after a restart). It
  **never** auto-finalizes — consistent with the freeze decision.

### Finalize transaction (SELL / UNSOLD)

Atomic, inside `$transaction`:

- **SELL** (`leadingTeamId != null`): `status = SOLD`, `soldToTeamId =
leadingTeamId`, `soldPrice = currentPrice`; create `TeamPlayer { acquiredVia:
AUCTION in MAIN round / REAUCTION in re-auction round, price: soldPrice }`;
  `committedAmount += soldPrice`, `playerCount += 1`. Broadcast `LOT_SOLD`.
- **UNSOLD**: `status = UNSOLD`. Broadcast `LOT_UNSOLD`.
- Either way: clear `currentAuctionPlayerId` + `currentLotEndsAt`, drop the
  registry entry, recompute every team's `maxBid`, bump `seq`. The auction now
  has no lot on the block; the organizer opens the next via `LOT_OPEN`.

> `LOT_REOPEN` (undo a finalize) is **deferred** (locked) — not built in v1.

---

## 8. Bidding modes (`Auction.biddingMode`)

Both modes share the **identical** pipeline (§6); only the authZ in step 1 and
the `bidderUserId` recorded differ.

- **`FRANCHISE`** — each franchise client emits `BID_PLACE` for **its own**
  team. AuthZ: `user.role === FRANCHISE && team.ownerUserId === user.id`
  (or `SUPER_ADMIN`/owner-organizer acting). `bidderUserId = user.id`,
  `teamId = the bidder's team`.
- **`ORGANIZER`** — only the organizer (or `SUPER_ADMIN`) emits bids, choosing
  `teamId` on a team's behalf; franchise clients are view-only and the server
  rejects their `BID_PLACE` with `ERROR { FORBIDDEN }`. `bidderUserId = the
organizer`, `teamId = the chosen team`.

`biddingMode` is locked once the auction leaves `DRAFT` (already enforced in
Phase 4 config-lock); it cannot flip mid-auction.

---

## 9. Auction state machine

```
DRAFT ──LOT control──▶ LIVE ⇄ PAUSED
  │                     │
  │                     ▼
  │              RE_AUCTION (round = RE_AUCTION) ⇄ PAUSED
  │                     │
  │                     ▼
  │                ASSIGNMENT
  │                     │
  └─────────────────────▼
                   COMPLETED
```

All transitions are organizer-driven (`PHASE_ADVANCE`), except `PAUSED` which is
the timer pause overlay on `LIVE`/`RE_AUCTION`.

| From         | To           | Guard                                                                                                                                               |
| ------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRAFT`      | `LIVE`       | go-live gate (already built: rules set, ≥1 lot, `minTeams ≤ #teams ≤ maxTeams`). Locks config.                                                      |
| `LIVE`       | `PAUSED`     | active lot timer freezes (§7)                                                                                                                       |
| `PAUSED`     | `LIVE`       | resume                                                                                                                                              |
| `LIVE`       | `RE_AUCTION` | no lot `ON_BLOCK`. Resets all `UNSOLD` main-round lots **in place** → `round = RE_AUCTION, status = PENDING`, clear `currentPrice`/`leadingTeamId`. |
| `RE_AUCTION` | `ASSIGNMENT` | no lot `ON_BLOCK`.                                                                                                                                  |
| `ASSIGNMENT` | `COMPLETED`  | **every** team has `playerCount >= minPlayersPerTeam` (else `MIN_NOT_MET`).                                                                         |

**Scope (locked): Phase 5 + Phase 6 built together.** This pass implements the
full lifecycle through `COMPLETED`:

- `DRAFT→LIVE`, `LIVE⇄PAUSED`, the MAIN round (open/freeze/sell/unsold) — Phase 5.
- `RE_AUCTION` (reset unsold in place, re-run the same lot loop on round
  `RE_AUCTION`), `ASSIGNMENT`, and `COMPLETED` — Phase 6.

### ASSIGNMENT phase (`ASSIGN_PLAYER`)

- Assignable players = lots still `PENDING`/`UNSOLD` (not sold/assigned), within
  the auction.
- A **franchise owner** may _choose_ a player for **their own** team
  (`acquiredVia = CHOSEN`); the **organizer** may _force-assign_ any remaining
  player to any team below minimum (`acquiredVia = FORCE_ASSIGNED`). Price =
  `rules.unsoldPrice`.
- Guards: `team.playerCount < maxPlayersPerTeam`; `committedAmount + unsoldPrice
<= creditPerTeam` (`RESERVE_EXCEEDED`). Atomic: create `TeamPlayer`, set lot
  `status = ASSIGNED`, `soldToTeamId`, `soldPrice = unsoldPrice`, bump tallies.
  Broadcast `PLAYER_ASSIGNED`.
- `ASSIGNMENT→COMPLETED` is gated on every team meeting `minPlayersPerTeam`.

---

## 10. New error codes (added to `shared/src/errors.ts`)

Bid-pipeline codes (returned via `BID_REJECTED` / `ERROR`):

```
LOT_NOT_LIVE       // lot not ON_BLOCK, or timer expired (FROZEN) / paused
BAD_AMOUNT         // amount != required base/next-increment
TEAM_FULL          // playerCount >= maxPlayersPerTeam
RESERVE_EXCEEDED   // amount > maxBid (reserve math); also assignment can't afford unsoldPrice
OUTBID             // lost the compare-and-set race
STALE_VERSION      // client version behind current
DUPLICATE_BID      // (info) idempotent replay of a clientBidId
NO_LEADER          // LOT_SELL with no bid on the lot
MIN_NOT_MET        // ASSIGNMENT→COMPLETED while a team is below minPlayersPerTeam
```

Existing codes reused: `FORBIDDEN`, `UNAUTHENTICATED`, `NOT_FOUND`,
`INVALID_STATE` (e.g. bidding while not `LIVE`), `VALIDATION_ERROR`.

---

## 11. Server module layout (Phase 5 additions)

```
server/src/realtime/
  gateway.ts        // io.use auth middleware, connection + AUCTION_JOIN/LEAVE, room mgmt
  events.ts         // event-name constants + Zod payload schemas (shared with client via /shared)
  handlers/
    bid.handler.ts      // BID_PLACE → pipeline
    lot.handler.ts      // LOT_OPEN / LOT_FINALIZE / LOT_REOPEN
    timer.handler.ts    // TIMER_PAUSE / TIMER_RESUME + the in-memory timer registry + safety sweep
    phase.handler.ts    // PHASE_ADVANCE (DRAFT→LIVE, LIVE⇄PAUSED in P5)
  snapshot.ts       // buildStateSnapshot(auctionId) -> STATE_SNAPSHOT
  broadcast.ts      // seq counter + room emit helpers
server/src/services/
  reserve.ts        // maxBid(), requiredIncrement() — pure, fully unit-tested
  bid-pipeline.ts   // the ordered gauntlet (§6), transaction + CAS
  finalize.ts       // SOLD/UNSOLD finalize transaction (§7)
```

- Event payload Zod schemas live in `shared/src/realtime.ts` so client and
  server validate the same shapes (mirrors how REST DTOs are shared today).
- `reserve.ts` is the mandatory unit-test target (build-plan §6). Pure functions
  over plain `{ creditPerTeam, committedAmount, minPlayersPerTeam, playerCount,
maxPlayersPerTeam, unsoldPrice }` + `Decimal` — no DB, no socket.
- The socket bootstrap in `index.ts` (currently a stub) is replaced by
  `gateway.ts` wiring.

---

## 12. Client architecture (Phase 5 additions)

```
client/src/socket/
  socket.ts         // singleton io() with auth token injection + reconnect
  useAuctionRoom.ts // hook: join, hold snapshot state, apply deltas, expose actions
client/src/features/auction-live/
  AuctionLivePage.tsx    // the centerpiece screen
  CurrentLotCard.tsx     // player, price, leader, countdown
  TeamsBoard.tsx         // all teams: credit, committed, squad count, maxBid
  BidControls.tsx        // mode-aware: franchise self-bid vs organizer team-picker
  OrganizerControls.tsx  // open next lot, finalize, pause/resume, phase advance
  LotQueue.tsx           // pending/sold/unsold roster
```

- `useAuctionRoom` holds the snapshot, applies `seq`-ordered deltas, and
  re-joins (re-snapshots) on reconnect or a `seq` gap.
- Money stays a **string** end-to-end in the client; format for display only,
  never `parseFloat` for arithmetic. Bid amount the client sends is the
  server-provided `requiredNextBid` (the client never computes increments).
- Countdown renders from `endsAt` with a one-time skew offset from `serverTime`.

---

## 13. Decisions (resolved 2026-06-26)

1. **Anti-snipe** — **OUT.** `endsAt` set once at `LOT_OPEN`, never extended.
2. **Timer expiry** — **FREEZE, organizer decides.** Zero does not finalize and
   never auto-advances; lot freezes; organizer issues `LOT_SELL` /
   `LOT_MARK_UNSOLD` / `TIMER_ADD`, then `LOT_OPEN` for the next player (§7).
3. **`LOT_REOPEN`** (undo finalize) — **deferred**, not in v1.
4. **Scope** — **Phase 5 + Phase 6 together**: full lifecycle through
   `COMPLETED`, including re-auction and assignment (§9).
5. **Spectators** — out of v1; entitled participants only (§3).
6. **Worked-example** (§6.1) — `committedAmount = 97.0` reconstructed for the
   "7th-player max bid = 0.5" anchor. Still worth a glance, but it's
   self-consistent and now the unit-test source of truth.
