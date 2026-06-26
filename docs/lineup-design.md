# Post-Auction Lineups — Design & Validation Rules

Companion to the lineup models in `schema.prisma`. Built from the Round 3 answers.

## What's locked in

- **One fixed lineup per team**, created after the auction completes; editable later only if the organizer allows.
- **Sport is fixed** on the league, so a lineup is either cricket or football — never both.
- **Hybrid roles:** football players carry a structured `footballPosition` (GK/DEF/MID/FWD) on the global player record; cricket roles are assigned at lineup time via flags on `LineupMember`.
- **Rules are organizer-set** per auction via `LineupRules`.
- **Franchise owner builds** the lineup; the **organizer can edit/override and locks** it. Validation runs **on every save**.

### Assumptions applied (flag if any are wrong)

- **Starting size** defaults to 11 and is organizer-overridable (`LineupRules.startingSize`).
- **Overseas cap** is organizer-enabled with an organizer-set max, counted **within the starting XI**, for both sports. Overseas players are flagged by the organizer on `AuctionPlayer.isOverseas`.
- **Cricket has no bench** — non-XI squad members are `RESERVE`. Football bench size is organizer-set (`benchSize`).
- **Editable-after-lock** is an organizer toggle (`editableAfterLockByOwner`); the organizer can always edit.

---

## Data model

| Model | Role |
|---|---|
| `LineupRules` | 1:1 with `Auction`. Starting size, overseas cap, cricket required-role toggles, football bench size, edit/lock policy. |
| `Formation` | Global football preset (`numGK/numDef/numMid/numFwd`). |
| `AuctionAllowedFormation` | Which formations the organizer permits for an auction. |
| `Lineup` | 1:1 with `Team`. Status (`DRAFT`/`LOCKED`), chosen formation (football), lock metadata. |
| `LineupMember` | A squad player's placement (`STARTER`/`BENCH`/`RESERVE`), batting order, and role flags. One per `TeamPlayer`. |

New fields on existing models: `Player.footballPosition`, `AuctionPlayer.isOverseas`.

Roles live as flags on `LineupMember` (`isCaptain`, `isViceCaptain`, `isWicketkeeper`, `isFirstBowler`, `isSecondBowler`) so one player can hold several at once. Football slot occupancy is `assignedPosition`; the player's own `footballPosition` only matters for the GK lock.

---

## Lifecycle

```
auction COMPLETED
      │
      ▼
DRAFT ── owner edits; every save runs validation and returns any violations
      │   (a draft can be saved while invalid; it just can't be locked)
      ▼ organizer locks (only if zero violations)
LOCKED
      │   - organizer can always edit (re-validates, stays/relocks)
      │   - owner can edit only if editableAfterLockByOwner = true
      ▼
(matchday use)
```

`validate(lineup)` returns a list of error codes (below). The UI shows them live; `lock` is rejected unless the list is empty.

---

## Cricket validation

Let `N = LineupRules.startingSize` (default 11) and let **starters** = members with `membership = STARTER`.

**Composition**
- `XI_SIZE` — exactly `N` starters.
- `BATTING_ORDER` (if `requireFullBattingOrder`) — every starter has a `battingOrder`, the set is exactly `1..N`, no gaps or duplicates. (`@@unique([lineupId, battingOrder])` enforces uniqueness at the DB level; the validator covers completeness.)

**Required roles** (each, if its toggle is on, must be held by **exactly one** starter)
- `MISSING_WK` — `requireWicketkeeper` and no starter has `isWicketkeeper`.
- `MISSING_CAPTAIN` — `requireCaptain` and no `isCaptain`.
- `MISSING_VICE_CAPTAIN` — `requireViceCaptain` and no `isViceCaptain`.
- `MISSING_FIRST_BOWLER` — `requireFirstBowler` and no `isFirstBowler`.
- `MISSING_SECOND_BOWLER` — `requireSecondBowler` and no `isSecondBowler`.
- `ROLE_NOT_IN_XI` — any role flag set on a non-starter.

**Distinctness & overlap** (this is the part you specified)
- `CAPTAIN_EQ_VICE_CAPTAIN` — captain and vice-captain must be different players.
- `FIRST_EQ_SECOND_BOWLER` — 1st and 2nd bowler must be different players.
- `WK_IS_BOWLER` — the wicketkeeper must **not** also be the 1st or 2nd bowler.

Allowed overlaps (no error): captain may also be the WK; captain may also be a bowler; vice-captain may also be the WK or a bowler. The only hard exclusion is **WK ≠ bowler**; the only forced-distinct pairs are **captain ≠ vice-captain** and **1st ≠ 2nd bowler**.

| Pair | Same player allowed? |
|---|---|
| Captain & Vice-captain | No |
| Captain & WK | Yes |
| Captain & 1st/2nd bowler | Yes |
| Vice-captain & WK | Yes |
| Vice-captain & 1st/2nd bowler | Yes |
| WK & 1st/2nd bowler | **No** |
| 1st bowler & 2nd bowler | No |

**Overseas**
- `OVERSEAS_CAP` (if `overseasCapEnabled`) — count of starters whose `AuctionPlayer.isOverseas = true` exceeds `maxOverseasInXI`.

---

## Football validation

Let `N = startingSize`, **starters** = `membership = STARTER`, **bench** = `membership = BENCH`.

**Formation**
- `FORMATION_REQUIRED` — `Lineup.formationId` is null.
- `FORMATION_NOT_ALLOWED` — chosen formation isn't in `AuctionAllowedFormation` for this auction.
- `FORMATION_SIZE` — `numGK + numDef + numMid + numFwd ≠ N`.

**Composition**
- `XI_SIZE` — exactly `N` starters.
- `SLOT_DISTRIBUTION` — the count of starters per `assignedPosition` must match the formation (`numGK` GKs, `numDef` DEFs, etc.).
- `GK_SLOT_INVALID` — the player in a GK slot must have `Player.footballPosition = GK`. **Only the GK slot is locked**; any non-GK player may fill any DEF/MID/FWD slot regardless of their nominal position.

**Roles**
- `MISSING_CAPTAIN` / `MISSING_VICE_CAPTAIN` — required, each exactly one starter.
- `CAPTAIN_EQ_VICE_CAPTAIN` — must be different players.
- `ROLE_NOT_IN_XI` — captain/VC flag on a non-starter.

**Bench**
- `BENCH_SIZE` (if `benchSize` set) — exactly `benchSize` members with `membership = BENCH`. Everyone else is `RESERVE`.

**Overseas**
- `OVERSEAS_CAP` (if `overseasCapEnabled`) — overseas starters exceed `maxOverseasInXI`.

---

## Shared rules (both sports)

- `NOT_IN_SQUAD` — a `LineupMember` must reference a `TeamPlayer` belonging to this team (its won/assigned squad).
- `LOCKED_NOT_EDITABLE` — a save by the owner is rejected when `status = LOCKED` and `editableAfterLockByOwner = false`. Organizer saves are always allowed.
- A lineup can only be created once the auction is `COMPLETED`.

---

## Validator shape (suggested)

```ts
type Violation = { code: string; detail?: string };

function validateLineup(ctx: {
  sport: Sport;
  rules: LineupRules;
  formation?: Formation;
  members: LineupMember[];      // joined with AuctionPlayer.isOverseas + Player.footballPosition
}): Violation[];
```

Run it inside the same transaction as the save so a lock can't slip through on stale data, and return the violations to the client for inline display. The role flags and `assignedPosition` make every check a simple in-memory pass over `members` — no extra queries beyond the initial join.

---

## Open / future

- Overseas counting scope is set to the XI; if you ever want it on the full matchday squad (XI + bench) or whole squad, it's a one-line change in the validator.
- Cricket "impact player" / substitute concept isn't modelled (you said reserves only) — easy to add later as a `BENCH` membership for cricket if the rules evolve.
- Per-match lineups: `Lineup` is currently 1:1 with `Team`. To go per-fixture later, add a `Match` model and move the unique constraint to `(teamId, matchId)` — the member/role structure stays identical.
