# Architecture — Real-time auction engine (source of truth)

> Companion to `build-plan.md` (§6–7) and `schema.prisma`. This document is the
> authoritative spec for the Socket.io layer, the server-authoritative bid
> pipeline, the credit-reserve math, the lot timer, and the auction state
> machine. Phase 5/6 code derives from this file. Where this file restates a
> build-plan invariant, the build plan wins on conflict — flag any discrepancy.
>
> **Last updated 2026-07-08** — reflects the post-launch improvements: organizer
> corrections (undo/reset/reverse/re-bid), whole-auction lifecycle
> (suspend/resume/cancel, one live auction per season), the chainable **unsold
> auction** (`RE_AUCTION` sweep), the assignment **pick rotation**, the
> **auto-pilot** bot engine, **connection presence** bars, the forced
> password change for provisioned accounts, and **pre-auction retention**
> (teams keep previous-season players at an editable price, deducted from
> their budget at go-live).

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

### Forced password change (REST, gates everything)

Every provisioned account (admin→organizer, organizer→franchise) is created with
`User.mustChangePassword = true`; a creator **reset**
(`POST /api/users/:id/reset-password`) sets it again. While the flag is set the
client renders only the full-screen change form; `POST /api/auth/change-password`
verifies the current password, requires a different new one, clears the flag and
returns a fresh token. Existing pre-flag accounts were backfilled by migration
(`20260704090251`); the seed `SUPER_ADMIN` is exempt (credentials live in `.env`).

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

- **Organizer-only control events** (lot control, corrections, timer, phase,
  force-assign, skip-turn, auto-pilot, suspend/resume/cancel): caller must be
  the auction owner (or `SUPER_ADMIN`).
- **Manual-control events** are additionally rejected while auto-pilot is
  driving (`requireManualControl`) — suspend/cancel stay available as the
  kill-switch.
- **`BID_PLACE`** depends on `biddingMode` (§8).
- **`ASSIGN_PLAYER`** as a franchise is also gated on the pick rotation (§9).

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
    "status": "LIVE", // see the state machine (§9); SUSPENDED/CANCELLED included
    "round": "MAIN", // MAIN | RE_AUCTION | ASSIGNMENT
    "biddingMode": "FRANCHISE",
    "sport": "CRICKET",
    "autoPilot": false, // true while the bot engine drives (UI is view-only)
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
    // roster of the auction's lots for the board/queue/assignment list. Each item
    // carries player identity + cricketRole/bowlingStyle (for role-section
    // grouping), status, round, soldPrice, soldToTeamId. RETAINED lots
    // (pre-auction retention, materialized at go-live with soldToTeamId/
    // soldPrice set and no lotOrder) are counted but NEVER included in items —
    // they surface through team rosters, not the bidding queue.
    "counts": { "PENDING": 40, "ON_BLOCK": 1, "SOLD": 12, "UNSOLD": 3, "ASSIGNED": 0, "RETAINED": 4 },
    "items": [/* LiveLot[] */],
  },
  // Pick rotation — non-null only while status = ASSIGNMENT (§9).
  "assignment": { "pickQueue": ["teamId…"], "skipped": ["teamId…"] },
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

| Event             | Payload                                                                | Auth                                         | Effect                                                                                           |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `AUCTION_JOIN`    | `{ auctionId }`                                                        | view                                         | join room, receive `STATE_SNAPSHOT`; presence tracking starts (§14)                              |
| `AUCTION_LEAVE`   | `{ auctionId }`                                                        | —                                            | leave room, presence tracking stops                                                              |
| `BID_PLACE`       | `{ auctionId, auctionPlayerId, teamId, amount, version, clientBidId }` | bid (§8)                                     | run bid pipeline (§6)                                                                            |
| `BID_UNDO`        | `{ auctionId }`                                                        | organizer                                    | correction: delete the newest bid on the open lot, roll price/leader back; fresh snapshot        |
| `BID_RESET`       | `{ auctionId }`                                                        | organizer                                    | correction: wipe ALL bids on the open lot back to no-bid state; fresh snapshot                   |
| `LOT_OPEN`        | `{ auctionId, auctionPlayerId }`                                       | organizer                                    | put a `PENDING` lot `ON_BLOCK` (opens at `openingPrice`, §9), start timer                        |
| `LOT_SELL`        | `{ auctionId, auctionPlayerId }`                                       | organizer                                    | finalize SOLD to current leader (`NO_LEADER` if none)                                            |
| `LOT_MARK_UNSOLD` | `{ auctionId, auctionPlayerId }`                                       | organizer                                    | finalize UNSOLD                                                                                  |
| `SALE_REVERSE`    | `{ auctionId }`                                                        | organizer                                    | correction: undo the LAST sale — lot back ON_BLOCK in pre-sell state, tallies rolled back        |
| `LOT_REBID`       | `{ auctionId, auctionPlayerId }`                                       | organizer                                    | correction: re-auction a finished (SOLD/UNSOLD) lot fresh — bids wiped, base price, new timer    |
| `TIMER_ADD`       | `{ auctionId, seconds }`                                               | organizer                                    | (re)start the lot clock; reopens a `FROZEN` lot                                                  |
| `TIMER_PAUSE`     | `{ auctionId }`                                                        | organizer                                    | freeze the active lot timer (PAUSED)                                                             |
| `TIMER_RESUME`    | `{ auctionId }`                                                        | organizer                                    | resume with stored remaining time                                                                |
| `PHASE_ADVANCE`   | `{ auctionId, to }`                                                    | organizer                                    | state-machine transition (§9): `RE_AUCTION` \| `ASSIGNMENT` \| `COMPLETED`                       |
| `ASSIGN_PLAYER`   | `{ auctionId, auctionPlayerId, teamId }`                               | organizer (force) / franchise owner (choose) | ASSIGNMENT: assign a remaining player at `unsoldPrice`; franchise picks only on their turn (§9)  |
| `ASSIGN_SKIP`     | `{ auctionId, teamId }`                                                | organizer                                    | toggle a team out of / back into the pick rotation (an absent team must not stall the draft)     |
| `AUTO_START`      | `{ auctionId }`                                                        | organizer                                    | hand the auction to the bot engine (§13); manual controls lock                                   |
| `AUTO_STOP`       | `{ auctionId }`                                                        | organizer                                    | freeze the bots in place (auction stays LIVE, open lot keeps price/leader); manual control back  |
| `AUCTION_SUSPEND` | `{ auctionId }`                                                        | organizer                                    | whole-auction pause (block must be empty); resumable                                             |
| `AUCTION_RESUME`  | `{ auctionId }`                                                        | organizer                                    | back to the round it was suspended in (LIVE / RE_AUCTION)                                        |
| `AUCTION_CANCEL`  | `{ auctionId }`                                                        | organizer                                    | terminal soft-cancel; records kept for history                                                   |

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
| `LOT_SOLD`          | `{ seq, auctionPlayerId, soldToTeamId, soldPrice, team: { id, committedAmount, playerCount, maxBid }, lotCounts, lot }`                                                            |
| `LOT_UNSOLD`        | `{ seq, auctionPlayerId, lotCounts, lot }`                                                                                                                                         |
| `PLAYER_ASSIGNED`   | `{ seq, auctionPlayerId, teamId, price, acquiredVia, team, lotCounts, lot, assignment }` — carries the post-pick rotation (§9)                                                     |
| `ASSIGN_TURN`       | `{ seq, assignment: { pickQueue, skipped } }` — rotation changed without a player moving (organizer skip/unskip)                                                                   |
| `TIMER_PAUSED`      | `{ seq, auctionPlayerId, remainingMs }`                                                                                                                                            |
| `TIMER_RESUMED`     | `{ seq, auctionPlayerId, endsAt }`                                                                                                                                                 |
| `PHASE_CHANGED`     | `{ seq, status, round, assignment }` — `assignment` is the fresh rotation when entering ASSIGNMENT, else `null`                                                                    |
| `AUTO_FINISHED`     | `{ seq, status, round, completed, report }` — end of an auto-pilot run, with the best-effort per-team squad report (§13)                                                           |
| `AUTO_STOPPED`      | `{ seq }` — organizer froze the bots mid-run; a fresh `STATE_SNAPSHOT` follows                                                                                                     |
| `PRESENCE_PING`     | per-socket probe with an **ack callback** — the client invokes it immediately; the round trip is the latency (§14)                                                                 |
| `PRESENCE`          | `{ users: { [userId]: rttMs \| null } }` — **to the auction's organizer/admin sockets only**, every ~5s; no `seq` (display-only side channel, §14)                                 |
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
DRAFT ──go-live──▶ LIVE ⇄ PAUSED
  │                 │  ⇅ SUSPENDED (whole-auction pause; also forced by a season rival going live)
  │                 ▼
  │          RE_AUCTION ("unsold auction"; chainable onto itself) ⇄ PAUSED/SUSPENDED
  │                 │
  │                 ▼
  │            ASSIGNMENT
  │                 │
  └─────────────────▼
               COMPLETED          (any non-terminal state ──▶ CANCELLED)
```

All transitions are organizer-driven (`PHASE_ADVANCE` /
`AUCTION_SUSPEND|RESUME|CANCEL`), except `PAUSED` (the per-lot timer pause
overlay) and the forced suspension below. No transition may run with a lot
still `ON_BLOCK`.

**One live auction per season.** Go-live calls `suspendSeasonRivals`: every
OTHER auction of the same season in `LIVE/PAUSED/RE_AUCTION/ASSIGNMENT` is
force-`SUSPENDED` (an on-block lot is put back to `PENDING`), and their rooms
get fresh snapshots. A suspended auction resumes into the round it left
(`LIVE` for MAIN, `RE_AUCTION` for the unsold round).

**One auction at a time per season (creation gate).** A season normally holds a
single auction (the IPL model; a follow-up mini/replacement auction is the
exception). `POST /seasons/:id/auctions` therefore rejects with `CONFLICT` while
any auction of that season is not yet `COMPLETED` or `CANCELLED` — a new auction
can only be created sequentially, after the previous one finishes. The season
page mirrors this by hiding the create form while an auction is in progress.

| From              | To           | Guard / effect                                                                                                                                                                                                    |
| ----------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DRAFT`           | `LIVE`       | go-live gate (rules set, ≥1 lot, ≥2 teams). Locks config, materializes `Team` rows, suspends season rivals.                                                                                                        |
| `LIVE`            | `PAUSED`     | active lot timer freezes (§7)                                                                                                                                                                                        |
| `PAUSED`          | `LIVE`       | resume                                                                                                                                                                                                               |
| `LIVE/RE_AUCTION` | `RE_AUCTION` | the **unsold auction sweep**: EVERY player not yet won — `UNSOLD` in any round **or never opened** (`PENDING`) — moves to `round = RE_AUCTION, status = PENDING`, price/leader cleared. Guard: ≥1 such player. **Chainable**: a further unsold auction can start from an unsold round with leftovers. |
| `LIVE/RE_AUCTION` | `ASSIGNMENT` | no lot on the block                                                                                                                                                                                                  |
| `ASSIGNMENT`      | `COMPLETED`  | **every** team has `playerCount >= minPlayersPerTeam` (else `MIN_NOT_MET`). Then, in one transaction, every still-`PENDING` lot is recorded **`UNSOLD`** — the auction closes with all lots terminal.               |
| any non-terminal  | `SUSPENDED`  | organizer suspend (block must be empty) or forced by a rival's go-live                                                                                                                                               |
| any non-terminal  | `CANCELLED`  | terminal soft-cancel; all records kept                                                                                                                                                                               |

**Opening price is round-aware** (`openingPrice` in `services/reserve.ts`): a
lot opened in the `RE_AUCTION` round starts at `rules.unsoldPrice` instead of
its `basePrice`. Bid validation, `requiredNextBid`, snapshots and the bot
engine all share this single function.

### ASSIGNMENT phase — full list + pick rotation

Assignable players = lots still `PENDING`/`UNSOLD` (everyone without a team,
including players never opened). The client shows them as a full list grouped
into role sections (batsmen / wicketkeepers / pace / spin / all-rounders); the
price is always `rules.unsoldPrice`.

**Pick rotation** (`services/assignment.ts`). Teams take players ONE at a time:

- The order is fixed at the start of assignment: **most free slots first**,
  alphabetical (franchise name) on ties. Picks then alternate round by round —
  a team that starts several slots behind cannot take them all in a row.
- **Every player a team receives counts as its turn**, whether a franchise
  self-pick (`acquiredVia = CHOSEN`) or an organizer force-assign
  (`FORCE_ASSIGNED`).
- Eligibility: below `maxPlayersPerTeam`, can afford `unsoldPrice`, not
  skipped. Ineligible teams drop out; the rest continue in the same order.
- The rotation is **derived, not stored**: `CHOSEN`/`FORCE_ASSIGNED`
  acquisitions only happen in this phase, so picks-so-far = their count and the
  entry order falls out of `playerCount - picks`. Restart-safe with no cursor.
- A **franchise** may pick only when its team is `pickQueue[0]`
  (`NOT_YOUR_TURN` otherwise, enforced server-side). The **organizer** may
  force-assign to any eligible team at any time, and may `ASSIGN_SKIP` an
  absent team out of the rotation (toggle back with the same event). Skips are
  in-memory and reset on phase change / restart.
- Guards per assignment: `TEAM_FULL`, `RESERVE_EXCEEDED`
  (`committedAmount + unsoldPrice <= creditPerTeam`). Atomic: create
  `TeamPlayer`, lot → `ASSIGNED`, bump tallies. Broadcast `PLAYER_ASSIGNED`
  with the post-pick rotation.

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
NOT_YOUR_TURN      // franchise ASSIGN_PLAYER out of rotation order (§9)
INCOMPLETE_LINEUP  // REST lineup save with any validator violation (complete-or-nothing)
```

Existing codes reused: `FORBIDDEN`, `UNAUTHENTICATED`, `NOT_FOUND`,
`INVALID_STATE` (e.g. bidding while not `LIVE`), `VALIDATION_ERROR`.

---

## 11. Server module layout (as built)

```
server/src/realtime/
  gateway.ts        // io.use auth middleware, ALL event handlers, room mgmt
  authz.ts          // canViewAuction / requireOrganizer / requireManualControl / auctionOwnerId
  snapshot.ts       // buildStateSnapshot(auctionId) -> STATE_SNAPSHOT
  broadcast.ts      // seq counter + room/socket emit helpers
  mappers.ts        // Prisma rows -> wire DTOs (SnapshotTeam, LiveLot, CurrentLot, …)
  timer.ts          // in-memory lot-timer registry + crash-safety sweep
  presence.ts       // room presence + RTT probes, organizer-only reports (§14)
server/src/services/
  reserve.ts        // maxBid(), requiredIncrement(), openingPrice() — pure, unit-tested
  bid-pipeline.ts   // the ordered gauntlet (§6), CAS + undo/reset corrections
  lot.ts            // LOT_OPEN
  finalize.ts       // SOLD/UNSOLD finalize + reverseLastSale + rebidLot
  phase.ts          // advancePhase (§9), suspend/resume/cancel, suspendSeasonRivals
  assignment.ts     // assignPlayer + pick rotation (pickQueueFrom, skips) — unit-tested
  lineup-validator.ts // per-sport lineup rules (complete-or-nothing saves) — unit-tested
  auto-pilot/
    engine.ts       // the bot run loop (§13)
    valuation.ts    // par-price bot valuation model — unit-tested
    roles.ts        // squad-target bookkeeping + soft role caps — unit-tested
    bot.ts          // per-team bot decision (bid/pass) — unit-tested
```

- Event payload Zod schemas live in `shared/src/realtime.ts` so client and
  server validate the same shapes (mirrors how REST DTOs are shared today).
- `reserve.ts`, `assignment.ts`, `lineup-validator.ts` and the `auto-pilot/*`
  models are the unit-test targets (88 tests). End-to-end socket flows are
  exercised by the repo-root harnesses `smoke-auto-pilot.mjs`,
  `test-unsold-flow.mjs`, `test-pwd-presence.mjs` against a running server.

---

## 12. Client architecture (as built)

```
client/src/socket/
  socket.ts         // singleton io() with auth token injection + PRESENCE_PING ack
  useAuctionRoom.ts // hook: join, hold snapshot state, apply deltas, expose actions
client/src/features/auction-live/
  AuctionLivePage.tsx    // the centerpiece screen: current lot, bid controls,
                         // organizer controls (corrections, phases, auto-pilot),
                         // TeamsBoard (+ signal bars), role-sectioned lot queue,
                         // AssignmentPanel (pick rotation + grouped player list),
                         // auto-pilot report, unsold-players card on COMPLETED
  widgets.tsx            // StatusBadge, Countdown, fmtCr, PlayerIcon, …
client/src/features/monitor/AuctionMonitorPage.tsx  // REST monitor + presence bars
client/src/components/ui/
  signal-bars.tsx   // latency tiers: <150ms green ▂▄▆ / <500ms amber / red / grey offline
  role-icon.tsx     // cricket role SVGs (bat / pace / spin / bat+ball / gloves)
```

- `useAuctionRoom` holds the snapshot, applies `seq`-ordered deltas, and
  re-joins (re-snapshots) on reconnect or a `seq` gap. `PRESENCE` and
  `AUTO_FINISHED/AUTO_STOPPED` are side channels held outside the snapshot.
- Money stays a **string** end-to-end in the client; format for display only,
  never `parseFloat` for arithmetic. Bid amount the client sends is the
  server-provided `requiredNextBid` (the client never computes increments).
- Countdown renders from `endsAt` with a one-time skew offset from `serverTime`.

---

## 13. Auto-pilot (server bot engine)

The organizer can hand the whole auction to bots (`AUTO_START`); manual
controls lock (`requireManualControl`) until `AUTO_STOP` or the run finishes.

- **Run loop** (`auto-pilot/engine.ts`): opens lots round-robin across role
  sections (BATSMAN → WK → PACE → SPIN → ALL_ROUNDER, position derived from the
  finalized-lot count — deterministic and resume-safe), lets team bots bid,
  hammers, finalizes; advances phases itself: MAIN → RE_AUCTION → ASSIGNMENT
  (force-fill to minimum + best-effort role targets) → COMPLETED, then emits
  `AUTO_FINISHED` with a per-team squad report.
- **Valuation** (`valuation.ts`): anchored on **par price** = remaining credit ÷
  remaining slots (self-corrects spend toward high budget utilization), scaled
  by a quality² star factor, role-need, scarcity, a per-team personality
  (aggressive / balanced / frugal) and deterministic jitter (FNV-1a hashes — no
  `Math.random` in state decisions). Filler players value below the opening
  price → all bots pass → natural UNSOLD lots.
- **Discipline**: slot budgeting and a soft per-role cap keep bots from
  hoarding one role; all bids go through the same `BID_PLACE` pipeline (§6) —
  bots get no special powers.
- **Stop = freeze**: `AUTO_STOP` halts bots where they stand (an open lot keeps
  its price/leader, checked again after the hammer pause so a stop mid-hammer
  never finalizes). The auction stays LIVE; `AUTO_START` may resume, even
  mid-lot. Crash recovery: on boot, auctions flagged `autoPilot` resume their
  run.

---

## 14. Presence (connection bars)

- Every socket that joins an auction room is tracked in
  `realtime/presence.ts`; a ~5s loop emits `PRESENCE_PING` with an ack timeout
  per socket — the ack round-trip is the user's latency.
- Reports (`PRESENCE { users: { userId: rttMs | null } }`) go **only to that
  auction's organizer/owner + super-admin sockets**; franchises never see each
  other's connection state. A user absent from the map is offline; with
  multiple tabs the best RTT wins.
- The REST monitor (`GET /api/monitor/auctions/:id`) embeds the same map as
  `presence` when `canManage` — the monitor page renders bars per team owner.
- UI tiers (`signal-bars.tsx`): `<150ms` 3 green bars, `<500ms` 2 amber, above
  1 red, grey empty = offline / not joined.
- All in-memory and display-only: a server restart just starts measuring again;
  no `seq`, never part of the snapshot.

---

## 15. Decisions

Resolved 2026-06-26:

1. **Anti-snipe** — **OUT.** `endsAt` set once at `LOT_OPEN`, never extended.
2. **Timer expiry** — **FREEZE, organizer decides.** Zero does not finalize and
   never auto-advances; lot freezes; organizer issues `LOT_SELL` /
   `LOT_MARK_UNSOLD` / `TIMER_ADD`, then `LOT_OPEN` for the next player (§7).
3. **`LOT_REOPEN`** (undo finalize) — originally deferred; **since built** as
   the corrections pair `SALE_REVERSE` (undo last sale, pre-sell state) and
   `LOT_REBID` (fresh re-auction of a finished lot).
4. **Scope** — **Phase 5 + Phase 6 together**: full lifecycle through
   `COMPLETED`, including re-auction and assignment (§9).
5. **Spectators** — out of v1; entitled participants only (§3).
6. **Worked-example** (§6.1) — `committedAmount = 97.0` reconstructed for the
   "7th-player max bid = 0.5" anchor. Still worth a glance, but it's
   self-consistent and now the unit-test source of truth.

Resolved 2026-06-28 → 2026-07-04:

7. **Unsold auction** (2026-06-28) — one auction per season; the `RE_AUCTION`
   round is the "unsold auction" run after the main auction. The sweep takes
   ALL players not yet won (unsold **or never opened**); bidding restarts at
   `unsoldPrice`; chainable. Going live on another auction in the season
   force-suspends the running one.
8. **End this auction** (2026-06-28) — `ASSIGNMENT → COMPLETED` records every
   remaining `PENDING` lot as `UNSOLD` in the DB; the min-squad gate stays.
9. **Auto-pilot stop = freeze** (2026-06-28) — stopping bots never cancels the
   auction; it freezes in place and is resumable mid-lot (§13).
10. **Complete-or-nothing lineups** (2026-07-03) — a lineup save with ANY
    validator violation is rejected (`INCOMPLETE_LINEUP`, 409); no draft saves.
    Same rule for franchises, organizers and admins.
11. **Assignment pick rotation** (2026-07-04) — fixed entry order (most free
    slots, alphabetical ties), strict one-by-one turns, force-assign consumes
    the turn, organizer skip/unskip; franchise picks enforced server-side (§9).
12. **Forced password change** (2026-07-04) — every password set by someone
    else (provision or reset) must be replaced on next login; pre-existing
    accounts backfilled by migration; seed admin exempt (§3).
13. **Presence is organizer-only** (2026-07-04) — connection bars are visible
    to the auction organizer/admin only, on the live page and monitor (§14).
14. **Pre-auction retention** (2026-07-08) — organizer-only, DRAFT-only: each
    team may keep up to `AuctionRules.maxRetentionsPerTeam` players from an
    organizer-picked COMPLETED auction of the league, at an editable price
    (defaults to the previous cost). Staged in `AuctionRetention` (keyed on the
    franchise — teams don't exist until go-live); banned players and current
    lots are not retainable, and the team must still afford its squad minimum
    at the unsold price. Go-live materializes each row into an
    `AuctionPlayer(RETAINED)` (carries `isOverseas`, no `lotOrder`) plus a
    `TeamPlayer(RETAINED)` and seeds `committedAmount`/`playerCount`, so the
    reserve math starts from what retention spent. RETAINED lots are counted in
    `LotCounts` but never appear in the snapshot queue, the RE_AUCTION sweep, or
    COMPLETED terminalization (§4).
