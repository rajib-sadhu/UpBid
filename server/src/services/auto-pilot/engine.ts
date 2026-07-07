import type { AuctionPlayer, Player } from "@prisma/client";
import { SERVER_EVENTS, type SquadRoleKey, type TeamSquadReport } from "shared";
import type { AuthUser } from "../../auth/types.js";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { money, mul, sub, maxMoney, ZERO, type Money } from "../../lib/money.js";
import { emitToRoom, nextSeq } from "../../realtime/broadcast.js";
import { buildStateSnapshot } from "../../realtime/snapshot.js";
import { toIncrementTiers } from "../../realtime/mappers.js";
import { openingPrice, type IncrementTier } from "../reserve.js";
import * as timer from "../../realtime/timer.js";
import { openLot } from "../lot.js";
import { finalizeLot } from "../finalize.js";
import { advancePhase } from "../phase.js";
import { assignPlayer } from "../assignment.js";
import { placeBotBid } from "../bid-pipeline.js";
import {
  squadCounts,
  roleNeeds,
  needScore,
  playerRoles,
  roleReport,
  reserveSlotCount,
  roleCapExceeded,
  ROLE_COUNT,
  type CricketAttrs,
  type SquadTargets,
} from "./roles.js";
import { valuePlayer, jitterFor, qualityFor, personalityFor } from "./valuation.js";
import { chooseNextBidder, type BotCandidate, type BotRules } from "./bot.js";

// ===========================================================================
// Auto-pilot engine — drives an entire auction with bot bidders, reusing the
// real-time pipeline so clients animate exactly as in a human auction:
//   per lot:  openLot → (chooseNextBidder → placeBotBid)* → finalizeLot
//   phases:   MAIN → RE_AUCTION → ASSIGNMENT (best-effort fill) → COMPLETED
// The organizer watches; humans are blocked from bidding while autoPilot is on.
// Suspend/Cancel clear the flag and the loop exits cleanly (the kill-switch).
// A modest pace makes it watchable. The lot timer is OWNED here: it is bumped
// before each bid (so bids never expire-reject) and we finalize on convergence
// rather than waiting for the freeze.
// ===========================================================================

// Human-like pacing (ms). Bid delays vary per bid; the hammer lingers longer on
// an expensive lot. Random here is safe — pacing never touches auction state.
const PACE = {
  open: 1500, // after a lot goes on the block
  bidMin: 900, // fastest a rival bid comes back…
  bidMax: 2200, // …and the slowest (uniform in between)
  hammer: 2200, // "going once, going twice" before selling
  hammerBig: 1500, // extra linger when the lot got expensive (>4× base)
  unsold: 1800, // the silence before an unwanted lot is declared unsold
  lot: 1800, // between lots
  phase: 2000, // between phases
  assign: 500, // between force-assignments
};
const bidDelay = (): number => PACE.bidMin + Math.random() * (PACE.bidMax - PACE.bidMin);
const LOT_WINDOW_MS = 30_000; // rolling timer window, bumped each bid
const SCARCITY_CAP = 4;
const ZERO_TARGETS: SquadTargets = {
  minWicketkeepers: 0,
  minBatsmen: 0,
  minOpeners: 0,
  minPaceBowlers: 0,
  minSpinners: 0,
  minAllRounders: 0,
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Auctions with a live engine loop — guards against a double-start. */
const running = new Set<string>();

/** Auctions stopped by AUTO_STOP mid-run — finishRun emits AUTO_STOPPED (no
 * report) instead of AUTO_FINISHED, and the open lot is left frozen in place. */
const manualStops = new Set<string>();

type LotWithPlayer = AuctionPlayer & { player: Player };

const attrsOf = (p: {
  cricketRole: Player["cricketRole"];
  battingPosition: Player["battingPosition"];
  bowlingStyle: Player["bowlingStyle"];
}): CricketAttrs => ({
  cricketRole: p.cricketRole,
  battingPosition: p.battingPosition,
  bowlingStyle: p.bowlingStyle,
});

interface EngineContext {
  organizerId: string;
  rules: BotRules;
  tiers: IncrementTier[];
  targets: SquadTargets;
}

/** Load the static per-run context (rules, tiers, targets, organizer). */
async function loadContext(auctionId: string): Promise<EngineContext> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      rules: true,
      incrementTiers: { orderBy: { fromAmount: "asc" } },
      cricketSquadTargets: true,
      season: { select: { league: { select: { organizerId: true, sport: true } } } },
    },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  if (!auction.rules) throw Errors.invalidState("Auction has no rules configured");
  const isCricket = auction.season.league.sport === "CRICKET";
  const t = auction.cricketSquadTargets;
  return {
    organizerId: auction.season.league.organizerId,
    rules: {
      creditPerTeam: auction.rules.creditPerTeam,
      minPlayersPerTeam: auction.rules.minPlayersPerTeam,
      maxPlayersPerTeam: auction.rules.maxPlayersPerTeam,
      unsoldPrice: auction.rules.unsoldPrice,
    },
    tiers: toIncrementTiers(auction.incrementTiers),
    targets:
      isCricket && t
        ? {
            minWicketkeepers: t.minWicketkeepers,
            minBatsmen: t.minBatsmen,
            minOpeners: t.minOpeners,
            minPaceBowlers: t.minPaceBowlers,
            minSpinners: t.minSpinners,
            minAllRounders: t.minAllRounders,
          }
        : ZERO_TARGETS,
  };
}

/** Per-role scarcity = clamp(total unmet demand / remaining supply, 1, CAP). */
async function scarcityMap(
  auctionId: string,
  teamDemand: Record<SquadRoleKey, number>,
): Promise<Record<SquadRoleKey, number>> {
  const remaining = await prisma.auctionPlayer.findMany({
    where: { auctionId, status: { in: ["PENDING", "ON_BLOCK"] } },
    select: {
      player: { select: { cricketRole: true, battingPosition: true, bowlingStyle: true } },
    },
  });
  const supply = squadCounts(remaining.map((r) => attrsOf(r.player)));
  const map = {} as Record<SquadRoleKey, number>;
  for (const role of Object.keys(ROLE_COUNT) as SquadRoleKey[]) {
    const demand = teamDemand[role];
    const sup = supply[ROLE_COUNT[role]];
    const ratio = sup > 0 ? demand / sup : demand > 0 ? SCARCITY_CAP : 1;
    map[role] = Math.min(SCARCITY_CAP, Math.max(1, ratio));
  }
  return map;
}

/**
 * Build the bidding candidates for one lot ONCE: a team's squad, budget and
 * role-needs are fixed for the duration of a lot (only price/leader change), so
 * each team's private valuation is computed a single time here.
 */
async function buildCandidates(ctx: EngineContext, lot: LotWithPlayer): Promise<BotCandidate[]> {
  const teams = await prisma.team.findMany({
    where: { auctionId: lot.auctionId },
    include: { players: { include: { player: true } } },
    orderBy: { createdAt: "asc" }, // stable order → stable personalities
  });

  const totalDemand: Record<SquadRoleKey, number> = {
    WICKETKEEPER: 0,
    BATSMAN: 0,
    OPENER: 0,
    PACE_BOWLER: 0,
    SPINNER: 0,
    ALL_ROUNDER: 0,
  };
  const perTeam = teams.map((t, teamIndex) => {
    const counts = squadCounts(t.players.map((tp) => attrsOf(tp.player)));
    const needs = roleNeeds(counts, ctx.targets);
    totalDemand.WICKETKEEPER += needs.wicketkeepers;
    totalDemand.BATSMAN += needs.batsmen;
    totalDemand.OPENER += needs.openers;
    totalDemand.PACE_BOWLER += needs.paceBowlers;
    totalDemand.SPINNER += needs.spinners;
    totalDemand.ALL_ROUNDER += needs.allRounders;
    return { team: t, needs, counts, teamIndex };
  });

  const scarcity = await scarcityMap(lot.auctionId, totalDemand);
  const attrs = attrsOf(lot.player);
  const playerRoleKeys = playerRoles(attrs);

  const opening = openingPrice(lot.round, lot.basePrice, ctx.rules.unsoldPrice);

  return perTeam.map(({ team, needs, counts, teamIndex }): BotCandidate => {
    const ns = needScore(attrs, needs);
    const slotsRemaining = ctx.rules.maxPlayersPerTeam - team.playerCount;

    // Slot discipline: a depth player (fills no unmet need) is only worth bidding
    // on when there is a slot to spare AFTER reserving one for each unmet role
    // need. The soft role cap additionally stops a team stacking one role
    // (target + 2) while another is still short. Valuation 0 → the bot passes.
    const depthAllowed =
      slotsRemaining > reserveSlotCount(needs) &&
      !(needs.total > 0 && roleCapExceeded(attrs, counts, ctx.targets));

    let valuation = ZERO;
    if (slotsRemaining > 0 && (ns > 0 || depthAllowed)) {
      // Scarcity = the keenest among the roles this player fills that the team needs.
      let sc = 1;
      if (ns > 0) {
        for (const role of playerRoleKeys) {
          if (needs[ROLE_COUNT[role]] > 0) sc = Math.max(sc, scarcity[role]);
        }
      }
      // Par price — the budget anchor: remaining credit spread over the
      // remaining slots. This is what makes teams actually spend their purse.
      const remaining = sub(ctx.rules.creditPerTeam, team.committedAmount);
      const par: Money = maxMoney(opening, money(remaining.dividedBy(slotsRemaining)));
      valuation = valuePlayer({
        openingPrice: opening,
        parPrice: par,
        slotsRemaining,
        needScore: ns,
        scarcity: sc,
        quality: qualityFor(lot.playerId),
        personality: personalityFor(teamIndex),
        jitter: jitterFor(team.id, lot.playerId),
      });
    }
    return {
      teamId: team.id,
      committedAmount: team.committedAmount,
      playerCount: team.playerCount,
      valuation,
      isLeader: false,
    };
  });
}

/** Whether the engine should keep driving — DB autoPilot flag + status. */
async function stillRunning(auctionId: string): Promise<{ go: boolean; lotId: string | null }> {
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { autoPilot: true, status: true, currentAuctionPlayerId: true },
  });
  const go =
    !!a &&
    a.autoPilot &&
    (a.status === "LIVE" || a.status === "RE_AUCTION" || a.status === "ASSIGNMENT");
  return { go, lotId: a?.currentAuctionPlayerId ?? null };
}

/** Bump the lot's countdown so in-flight bot bids never expire-reject. */
async function bumpTimer(auctionId: string, lotId: string): Promise<void> {
  const endsAt = new Date(Date.now() + LOT_WINDOW_MS);
  await prisma.auction.update({ where: { id: auctionId }, data: { currentLotEndsAt: endsAt } });
  timer.armBidding(auctionId, lotId, endsAt);
}

/** Run the bot bidding rounds for the lot on the block, then finalize it. */
async function playLot(ctx: EngineContext, lot: LotWithPlayer, justOpened: boolean): Promise<void> {
  const auctionId = lot.auctionId;
  if (justOpened) await sleep(PACE.open);

  const candidates = await buildCandidates(ctx, lot);
  const opening = openingPrice(lot.round, lot.basePrice, ctx.rules.unsoldPrice);
  let anyBid = false;

  for (;;) {
    const a = await stillRunning(auctionId);
    if (!a.go || a.lotId !== lot.id) return; // aborted (suspend/cancel) mid-lot
    const live = await prisma.auctionPlayer.findUnique({
      where: { id: lot.id },
      select: { currentPrice: true, leadingTeamId: true, status: true },
    });
    if (!live || live.status !== "ON_BLOCK") break;

    const withLeader = candidates.map((c) => ({ ...c, isLeader: c.teamId === live.leadingTeamId }));
    const decision = chooseNextBidder(
      { currentPrice: live.currentPrice, basePrice: opening },
      withLeader,
      ctx.rules,
      ctx.tiers,
    );
    if (!decision) break;

    await bumpTimer(auctionId, lot.id);
    try {
      const accepted = await placeBotBid({
        auctionId,
        auctionPlayerId: lot.id,
        teamId: decision.teamId,
        bidderUserId: ctx.organizerId,
      });
      anyBid = true;
      emitToRoom(auctionId, SERVER_EVENTS.BID_ACCEPTED, { seq: nextSeq(auctionId), ...accepted });
    } catch {
      // Lost a CAS race / transient rejection — re-read and continue.
    }
    await sleep(bidDelay());
  }

  // The hammer: linger on a contested lot ("going once, going twice"), longer
  // when it got expensive; a no-interest lot sits in silence, then goes unsold.
  if (anyBid) {
    const priced = await prisma.auctionPlayer.findUnique({
      where: { id: lot.id },
      select: { currentPrice: true },
    });
    const big = priced?.currentPrice?.greaterThan(mul(opening, 4)) ?? false;
    await sleep(PACE.hammer + (big ? PACE.hammerBig : 0));
  } else {
    await sleep(PACE.unsold);
  }

  // Re-check AFTER the pause: an AUTO_STOP during the hammer must freeze the
  // lot as-is (leader and price intact), never finalize it.
  const still = await stillRunning(auctionId);
  if (!still.go || still.lotId !== lot.id) return;
  const finalLot = await prisma.auctionPlayer.findUnique({
    where: { id: lot.id },
    select: { leadingTeamId: true, status: true },
  });
  if (!finalLot || finalLot.status !== "ON_BLOCK") return;
  const result = await finalizeLot(auctionId, lot.id, finalLot.leadingTeamId ? "SELL" : "UNSOLD");
  if (result.type === "SOLD") {
    emitToRoom(auctionId, SERVER_EVENTS.LOT_SOLD, { seq: nextSeq(auctionId), ...result.payload });
  } else {
    emitToRoom(auctionId, SERVER_EVENTS.LOT_UNSOLD, { seq: nextSeq(auctionId), ...result.payload });
  }
}

/** Role sections the auto auction rotates through (cricket only). */
const SECTION_ORDER = ["BATSMAN", "WICKETKEEPER", "PACE", "SPIN", "ALL_ROUNDER"] as const;
type Section = (typeof SECTION_ORDER)[number];

function sectionOf(p: CricketAttrs): Section | null {
  switch (p.cricketRole) {
    case "BATSMAN":
      return "BATSMAN";
    case "WICKETKEEPER":
      return "WICKETKEEPER";
    case "BOWLER":
      return p.bowlingStyle === "SPINNER" ? "SPIN" : "PACE";
    case "ALL_ROUNDER":
      return "ALL_ROUNDER";
    default:
      return null;
  }
}

/**
 * The next PENDING lot. Cricket pools rotate role sections (batsman → WK →
 * pace → spin → all-rounder → …) so the auction mixes roles instead of
 * draining one section at a time; the rotation position derives from how many
 * lots have already been finalized, so it is deterministic and resume-safe.
 * Non-cricket players keep plain lot order.
 */
async function nextPendingLot(auctionId: string): Promise<LotWithPlayer | null> {
  const pending = await prisma.auctionPlayer.findMany({
    where: { auctionId, status: "PENDING" },
    orderBy: [{ lotOrder: "asc" }, { createdAt: "asc" }],
    include: { player: true },
  });
  if (pending.length === 0) return null;

  const bySection = new Map<Section, LotWithPlayer>();
  for (const lot of pending) {
    const s = sectionOf(attrsOf(lot.player));
    if (s && !bySection.has(s)) bySection.set(s, lot); // first = best lot order
  }
  if (bySection.size === 0) return pending[0]!; // non-cricket pool

  const finalized = await prisma.auctionPlayer.count({
    where: { auctionId, status: { in: ["SOLD", "UNSOLD", "ASSIGNED"] } },
  });
  for (let k = 0; k < SECTION_ORDER.length; k++) {
    const lot = bySection.get(SECTION_ORDER[(finalized + k) % SECTION_ORDER.length]!);
    if (lot) return lot;
  }
  return pending[0]!;
}

async function advanceAndBroadcast(
  auctionId: string,
  to: "RE_AUCTION" | "ASSIGNMENT" | "COMPLETED",
): Promise<void> {
  const result = await advancePhase(auctionId, to);
  emitToRoom(auctionId, SERVER_EVENTS.PHASE_CHANGED, { seq: nextSeq(auctionId), ...result });
}

/**
 * ASSIGNMENT best-effort fill: force-assign remaining players at the unsold
 * price, prioritising teams below the minimum (a hard requirement), then role
 * gaps. Stops when no team needs help or the pool / affordability runs out.
 */
async function assignmentFill(ctx: EngineContext, auctionId: string): Promise<void> {
  const organizer: AuthUser = { id: ctx.organizerId, role: "ORGANIZER" };
  const stuck = new Set<string>(); // teams we could not assign to (cap / afford)

  for (;;) {
    const a = await stillRunning(auctionId);
    if (!a.go) return;

    const [teams, available] = await Promise.all([
      prisma.team.findMany({
        where: { auctionId },
        include: { players: { include: { player: true } } },
      }),
      prisma.auctionPlayer.findMany({
        where: { auctionId, status: { in: ["PENDING", "UNSOLD"] } },
        orderBy: [{ basePrice: "asc" }, { createdAt: "asc" }],
        include: { player: true },
      }),
    ]);
    if (available.length === 0) return;

    // Neediest team: below-min dominates; then total role shortfall.
    let target: {
      teamId: string;
      needs: ReturnType<typeof roleNeeds>;
      belowMin: boolean;
      score: number;
    } | null = null;
    for (const t of teams) {
      if (stuck.has(t.id) || t.playerCount >= ctx.rules.maxPlayersPerTeam) continue;
      const needs = roleNeeds(squadCounts(t.players.map((tp) => attrsOf(tp.player))), ctx.targets);
      const belowMin = t.playerCount < ctx.rules.minPlayersPerTeam;
      if (!belowMin && needs.total === 0) continue;
      const score =
        (belowMin ? (ctx.rules.minPlayersPerTeam - t.playerCount) * 1000 : 0) + needs.total;
      if (!target || score > target.score) target = { teamId: t.id, needs, belowMin, score };
    }
    if (!target) return; // every team satisfied (best-effort complete)

    // Best player for the target team: highest need score, then cheapest (the
    // list is already cheapest-first, so the first max wins the tie).
    let pick = available[0]!;
    let bestNs = needScore(attrsOf(pick.player), target.needs);
    for (const ap of available) {
      const ns = needScore(attrsOf(ap.player), target.needs);
      if (ns > bestNs) {
        bestNs = ns;
        pick = ap;
      }
    }

    // A team already at the minimum only takes a player that fills a real role
    // gap — don't pad it with depth the pool happens to have left over.
    if (!target.belowMin && bestNs === 0) {
      stuck.add(target.teamId);
      continue;
    }

    try {
      const result = await assignPlayer(organizer, {
        auctionId,
        auctionPlayerId: pick.id,
        teamId: target.teamId,
      });
      emitToRoom(auctionId, SERVER_EVENTS.PLAYER_ASSIGNED, { seq: nextSeq(auctionId), ...result });
    } catch {
      stuck.add(target.teamId); // cap / unaffordable — stop trying this team
      continue;
    }
    await sleep(PACE.assign);
  }
}

/** Build the best-effort squad-composition report for every team. */
async function buildReport(
  auctionId: string,
  targets: SquadTargets,
  minPlayers: number,
): Promise<TeamSquadReport[]> {
  const teams = await prisma.team.findMany({
    where: { auctionId },
    include: { franchise: { select: { name: true } }, players: { include: { player: true } } },
    orderBy: { createdAt: "asc" },
  });
  return teams.map((t) => ({
    teamId: t.id,
    teamName: t.franchise.name,
    playerCount: t.playerCount,
    minPlayersMet: t.playerCount >= minPlayers,
    roles: roleReport(squadCounts(t.players.map((tp) => attrsOf(tp.player))), targets),
  }));
}

/** Clear the flag, emit the report, and re-snapshot (lifts the view-only lock). */
async function finishRun(auctionId: string, ctx: EngineContext): Promise<void> {
  if (manualStops.delete(auctionId)) {
    // Organizer pressed Stop Auto: the auction stays live under manual control
    // (possibly with the current lot still on the block) — no report, no
    // "finished" banner; just confirm the stop and lift the view-only lock.
    emitToRoom(auctionId, SERVER_EVENTS.AUTO_STOPPED, { seq: nextSeq(auctionId) });
    emitToRoom(auctionId, SERVER_EVENTS.STATE_SNAPSHOT, await buildStateSnapshot(auctionId));
    return;
  }
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { autoPilot: true, status: true, round: true },
  });
  if (a?.autoPilot) {
    await prisma.auction.update({ where: { id: auctionId }, data: { autoPilot: false } });
  }
  const report = await buildReport(auctionId, ctx.targets, ctx.rules.minPlayersPerTeam);
  emitToRoom(auctionId, SERVER_EVENTS.AUTO_FINISHED, {
    seq: nextSeq(auctionId),
    status: a?.status ?? "COMPLETED",
    round: a?.round ?? "ASSIGNMENT",
    completed: a?.status === "COMPLETED",
    report,
  });
  emitToRoom(auctionId, SERVER_EVENTS.STATE_SNAPSHOT, await buildStateSnapshot(auctionId));
}

/** The driver loop. Always reaches finishRun via finally. */
async function runEngine(auctionId: string): Promise<void> {
  const ctx = await loadContext(auctionId);
  try {
    for (;;) {
      const a = await prisma.auction.findUnique({
        where: { id: auctionId },
        select: { autoPilot: true, status: true, round: true, currentAuctionPlayerId: true },
      });
      if (!a || !a.autoPilot) break;

      if (a.status === "LIVE" || a.status === "RE_AUCTION") {
        if (a.currentAuctionPlayerId) {
          // Resume a lot already on the block (crash recovery).
          const lot = await prisma.auctionPlayer.findUnique({
            where: { id: a.currentAuctionPlayerId },
            include: { player: true },
          });
          if (lot) await playLot(ctx, lot, false);
        } else {
          // If no team can take another player, bidding is over — don't grind
          // through the remaining lots as unsold; jump straight to assignment.
          const freeSlot = await prisma.team.findFirst({
            where: { auctionId, playerCount: { lt: ctx.rules.maxPlayersPerTeam } },
            select: { id: true },
          });
          if (!freeSlot) {
            await advanceAndBroadcast(auctionId, "ASSIGNMENT");
            await sleep(PACE.phase);
            continue;
          }
          const lot = await nextPendingLot(auctionId);
          if (lot) {
            const { currentLot, endsAt } = await openLot(auctionId, lot.id);
            timer.armBidding(auctionId, lot.id, endsAt);
            emitToRoom(auctionId, SERVER_EVENTS.LOT_OPENED, {
              seq: nextSeq(auctionId),
              currentLot,
            });
            await playLot(ctx, lot, true);
          } else {
            await advanceAndBroadcast(auctionId, a.round === "MAIN" ? "RE_AUCTION" : "ASSIGNMENT");
            await sleep(PACE.phase);
            continue;
          }
        }
        await sleep(PACE.lot);
      } else if (a.status === "ASSIGNMENT") {
        await assignmentFill(ctx, auctionId);
        // Complete only if every team met its minimum (the hard gate); otherwise
        // leave it in ASSIGNMENT and let the report surface the shortfall.
        const short = await prisma.team.findFirst({
          where: { auctionId, playerCount: { lt: ctx.rules.minPlayersPerTeam } },
          select: { id: true },
        });
        if (!short) await advanceAndBroadcast(auctionId, "COMPLETED");
        break;
      } else {
        break; // SUSPENDED / CANCELLED / COMPLETED / PAUSED / DRAFT
      }
    }
  } catch (e) {
    console.error("[auto-pilot] engine error:", e);
  } finally {
    await finishRun(auctionId, ctx).catch((e) => console.error("[auto-pilot] finish error:", e));
  }
}

async function launch(auctionId: string): Promise<void> {
  if (running.has(auctionId)) return;
  running.add(auctionId);
  try {
    await runEngine(auctionId);
  } finally {
    running.delete(auctionId);
  }
}

/**
 * Organizer entry point: hand the auction to the bot engine. Requires a live
 * round with no lot on the block. Sets the persisted flag (so humans go
 * view-only and a restart can resume) and kicks off the loop in the background.
 */
export async function startAutoPilot(auctionId: string): Promise<void> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { status: true },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  if (auction.status !== "LIVE" && auction.status !== "RE_AUCTION") {
    throw Errors.invalidState("Auto-pilot can only start from a live round");
  }
  if (running.has(auctionId)) return;
  // A lot already on the block (manual, or frozen by a previous AUTO_STOP) is
  // fine: the loop's resume path picks it up and the bots continue bidding.
  manualStops.delete(auctionId);
  await prisma.auction.update({ where: { id: auctionId }, data: { autoPilot: true } });
  void launch(auctionId);
}

/**
 * Organizer stop (the freeze): clear the flag so the loop halts before its next
 * action — the lot on the block keeps its price and leader, the auction stays
 * LIVE and manual controls unlock at once. AUTO_START resumes later, mid-lot ok.
 */
export async function stopAutoPilot(auctionId: string): Promise<void> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { autoPilot: true },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  if (!auction.autoPilot) throw Errors.invalidState("Auto-pilot is not running");
  if (running.has(auctionId)) manualStops.add(auctionId);
  await prisma.auction.update({ where: { id: auctionId }, data: { autoPilot: false } });
  if (!running.has(auctionId)) {
    // No live loop in this process (e.g. it already exited) — confirm directly.
    emitToRoom(auctionId, SERVER_EVENTS.AUTO_STOPPED, { seq: nextSeq(auctionId) });
  }
}

/** On boot, resume any auction left mid-auto-run by a previous process. */
export async function resumeAutoPilots(): Promise<void> {
  const active = await prisma.auction.findMany({
    where: { autoPilot: true, status: { in: ["LIVE", "RE_AUCTION", "ASSIGNMENT"] } },
    select: { id: true },
  });
  for (const a of active) void launch(a.id);
}
