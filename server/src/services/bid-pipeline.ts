import type { BidPlacePayload, BidAcceptedEvent } from "shared";
import type {
  Auction as PrismaAuction,
  AuctionPlayer,
  AuctionRules,
  BidIncrementTier,
  Team,
} from "@prisma/client";
import type { AuthUser } from "../auth/types.js";
import { prisma } from "../lib/prisma.js";
import { AppError, Errors } from "../lib/errors.js";
import { money, moneyToWire, eq, type Money } from "../lib/money.js";
import { canAcceptBid, requiredNextBid, openingPrice } from "./reserve.js";
import { toIncrementTiers, toTeamTally } from "../realtime/mappers.js";
import * as timer from "../realtime/timer.js";

export type AcceptedBid = Omit<BidAcceptedEvent, "seq">;

/** A normal race/validation rejection (emitted as BID_REJECTED, not ERROR). */
function reject(code: string, message: string): never {
  throw new AppError(code, message, 409);
}

/**
 * The server-authoritative bid pipeline (docs/architecture.md §6). Runs the
 * ordered gauntlet and commits via an optimistic compare-and-set on
 * AuctionPlayer.version — the sole serialization point for competing bids.
 * Throws AppError on any rejection; returns the accepted delta on success.
 * Team tallies are NOT touched here (only at finalize), so a losing/overbid
 * sequence can never corrupt committedAmount/playerCount.
 */
type AuctionForBid = PrismaAuction & {
  rules: AuctionRules | null;
  incrementTiers: BidIncrementTier[];
};

/**
 * Human bid (socket BID_PLACE). Resolves the entities, enforces mode-based
 * ownership authZ, refuses while auto-pilot is driving, then runs the shared
 * pipeline core. Throws AppError on any rejection; returns the accepted delta.
 */
export async function placeBid(user: AuthUser, payload: BidPlacePayload): Promise<AcceptedBid> {
  const { auctionId, auctionPlayerId, teamId } = payload;

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      rules: true,
      incrementTiers: { orderBy: { fromAmount: "asc" } },
      season: { select: { league: { select: { organizerId: true } } } },
    },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  if (!auction.rules) throw Errors.invalidState("Auction has no rules configured");

  const [lot, team] = await Promise.all([
    prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId } }),
    prisma.team.findUnique({
      where: { id: teamId },
      include: { franchise: { select: { ownerUserId: true } } },
    }),
  ]);
  if (!lot || lot.auctionId !== auctionId) throw Errors.notFound("Lot not found");
  if (!team || team.auctionId !== auctionId) throw Errors.notFound("Team not found");

  // While the bot engine is driving, all humans are spectators.
  if (auction.autoPilot) throw Errors.forbidden("Auto-pilot is running; manual bidding is disabled");

  // 1) AuthZ — depends on the bidding mode.
  const isAdmin = user.role === "SUPER_ADMIN";
  const ownerId = auction.season.league.organizerId;
  if (auction.biddingMode === "ORGANIZER") {
    if (!isAdmin && !(user.role === "ORGANIZER" && user.id === ownerId)) {
      throw Errors.forbidden("Only the organizer may bid in organizer mode");
    }
  } else if (!isAdmin && !(user.role === "FRANCHISE" && team.franchise.ownerUserId === user.id)) {
    throw Errors.forbidden("You can only bid for your own team");
  }

  return placeBidCore({
    auction,
    lot,
    team,
    amount: money(payload.amount),
    version: payload.version,
    clientBidId: payload.clientBidId,
    bidderUserId: user.id,
  });
}

/**
 * System bid placed by the auto-pilot engine on a team's behalf. No ownership
 * authZ (the server is acting); the bid is attributed to `bidderUserId` (the
 * auction organizer). Amount and version are read from the live lot, so the
 * shared core's reserve/cap/CAS gates still fully apply.
 */
export async function placeBotBid(args: {
  auctionId: string;
  auctionPlayerId: string;
  teamId: string;
  bidderUserId: string;
}): Promise<AcceptedBid> {
  const auction = await prisma.auction.findUnique({
    where: { id: args.auctionId },
    include: { rules: true, incrementTiers: { orderBy: { fromAmount: "asc" } } },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  if (!auction.rules) throw Errors.invalidState("Auction has no rules configured");

  const [lot, team] = await Promise.all([
    prisma.auctionPlayer.findUnique({ where: { id: args.auctionPlayerId } }),
    prisma.team.findUnique({ where: { id: args.teamId } }),
  ]);
  if (!lot || lot.auctionId !== args.auctionId) throw Errors.notFound("Lot not found");
  if (!team || team.auctionId !== args.auctionId) throw Errors.notFound("Team not found");

  const tiers = toIncrementTiers(auction.incrementTiers);
  const opening = openingPrice(lot.round, lot.basePrice, auction.rules.unsoldPrice);
  const amount = requiredNextBid(lot.currentPrice ?? null, opening, tiers);
  return placeBidCore({
    auction,
    lot,
    team,
    amount,
    version: lot.version,
    clientBidId: `bot-${args.auctionPlayerId}-${lot.version}`,
    bidderUserId: args.bidderUserId,
  });
}

/**
 * The shared, mode-agnostic bid gauntlet (architecture.md §6): lot-live →
 * idempotency → amount → squad cap → reserve → atomic compare-and-set on
 * version. The CAS is the sole serialization point for competing bids. Tallies
 * are NOT touched here (only at finalize). Used by both placeBid and placeBotBid.
 */
async function placeBidCore(input: {
  auction: AuctionForBid;
  lot: AuctionPlayer;
  team: Team;
  amount: Money;
  version: number;
  clientBidId: string;
  bidderUserId: string;
}): Promise<AcceptedBid> {
  const { auction, lot, team, amount, version, clientBidId, bidderUserId } = input;
  const rules = auction.rules!;
  const tiers = toIncrementTiers(auction.incrementTiers);

  // 2) Lot live — current lot, ON_BLOCK, auction biddable, timer not elapsed.
  const biddable = auction.status === "LIVE" || auction.status === "RE_AUCTION";
  const notExpired =
    auction.currentLotEndsAt != null && auction.currentLotEndsAt.getTime() > Date.now();
  if (
    !biddable ||
    lot.id !== auction.currentAuctionPlayerId ||
    lot.status !== "ON_BLOCK" ||
    !notExpired
  ) {
    reject("LOT_NOT_LIVE", "This lot is not open for bidding");
  }

  // 3) Idempotency — a replayed clientBidId is a no-op.
  const dup = await prisma.bid.findFirst({
    where: { auctionPlayerId: lot.id, clientBidId },
    select: { id: true },
  });
  if (dup) reject("DUPLICATE_BID", "Duplicate bid ignored");

  // 4) Amount correctness — exact opening price (base, or unsold price in the
  // re-auction round) for the first bid, otherwise current + required increment.
  const opening = openingPrice(lot.round, lot.basePrice, rules.unsoldPrice);
  const required = requiredNextBid(lot.currentPrice ?? null, opening, tiers);
  if (!eq(amount, required)) {
    reject("BAD_AMOUNT", `Bid must be exactly ${moneyToWire(required)}`);
  }

  // 5) Squad cap.
  if (team.playerCount >= rules.maxPlayersPerTeam) {
    reject("TEAM_FULL", "Team already has the maximum number of players");
  }

  // 6) Reserve / budget.
  const accepts = canAcceptBid(
    {
      creditPerTeam: rules.creditPerTeam,
      committedAmount: team.committedAmount,
      minPlayersPerTeam: rules.minPlayersPerTeam,
      maxPlayersPerTeam: rules.maxPlayersPerTeam,
      playerCount: team.playerCount,
      unsoldPrice: rules.unsoldPrice,
    },
    amount,
  );
  if (!accepts) reject("RESERVE_EXCEEDED", "Bid exceeds the team's available budget");

  // 7) Atomic compare-and-set on version + persist the Bid.
  const bid = await prisma.$transaction(async (tx) => {
    const upd = await tx.auctionPlayer.updateMany({
      where: { id: lot.id, version, status: "ON_BLOCK" },
      data: { currentPrice: amount, leadingTeamId: team.id, version: { increment: 1 } },
    });
    if (upd.count === 0) reject("OUTBID", "Another bid was accepted first");
    return tx.bid.create({
      data: {
        auctionId: auction.id,
        auctionPlayerId: lot.id,
        teamId: team.id,
        bidderUserId,
        amount,
        clientBidId,
      },
    });
  });

  // No anti-snipe: endsAt is unchanged. Tallies unchanged → maxBid unchanged.
  const nextRequired = requiredNextBid(amount, opening, tiers);
  return {
    auctionPlayerId: lot.id,
    currentPrice: moneyToWire(amount),
    leadingTeamId: team.id,
    version: version + 1,
    endsAt: auction.currentLotEndsAt ? auction.currentLotEndsAt.toISOString() : null,
    requiredNextBid: moneyToWire(nextRequired),
    bid: {
      teamId: team.id,
      bidderUserId,
      amount: moneyToWire(amount),
      createdAt: bid.createdAt.toISOString(),
    },
    team: toTeamTally(team, rules),
  };
}

/**
 * Organizer correction: hard-delete the most recent bid on the lot currently on
 * the block and roll price/leader back to the previous bid (or to no-bid). Pure
 * lot state — tallies are untouched because bids never move committedAmount
 * (only finalize does). Bumping `version` invalidates any in-flight CAS bid.
 * The caller rebroadcasts a fresh snapshot. The lot stays on the block; the
 * timer is left exactly as it was (BIDDING / FROZEN / PAUSED).
 */
export async function undoLastBid(auctionId: string): Promise<void> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { currentAuctionPlayerId: true },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  const lotId = auction.currentAuctionPlayerId;
  if (!lotId) throw new AppError("INVALID_STATE", "No lot is on the block", 409);
  const lot = await prisma.auctionPlayer.findUnique({ where: { id: lotId } });
  if (!lot || lot.status !== "ON_BLOCK") {
    throw new AppError("INVALID_STATE", "No lot is on the block", 409);
  }

  await prisma.$transaction(async (tx) => {
    const last = await tx.bid.findFirst({
      where: { auctionPlayerId: lotId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (!last) throw new AppError("NO_BIDS", "There is no bid to undo on this lot", 409);
    await tx.bid.delete({ where: { id: last.id } });
    const prev = await tx.bid.findFirst({
      where: { auctionPlayerId: lotId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    await tx.auctionPlayer.update({
      where: { id: lotId },
      data: {
        currentPrice: prev ? prev.amount : null,
        leadingTeamId: prev ? prev.teamId : null,
        version: { increment: 1 },
      },
    });
  });
}

/**
 * Organizer correction: wipe ALL bids on the lot currently on the block and
 * restart it from scratch — back to base price, no leader, with a fresh full
 * timer (bidding active again, even if it was frozen/paused). Tallies untouched
 * (bids never move committedAmount). Hard-deletes the lot's bid history. The
 * caller rebroadcasts a fresh snapshot.
 */
export async function resetCurrentLotBids(auctionId: string): Promise<void> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { rules: true },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  if (!auction.rules) throw Errors.invalidState("Auction has no rules configured");
  const lotId = auction.currentAuctionPlayerId;
  if (!lotId) throw new AppError("INVALID_STATE", "No lot is on the block", 409);
  const lot = await prisma.auctionPlayer.findUnique({ where: { id: lotId } });
  if (!lot || lot.status !== "ON_BLOCK") {
    throw new AppError("INVALID_STATE", "No lot is on the block", 409);
  }

  const endsAt = new Date(Date.now() + auction.rules.defaultLotDurationSec * 1000);
  const status = auction.round === "RE_AUCTION" ? "RE_AUCTION" : "LIVE";
  await prisma.$transaction([
    prisma.bid.deleteMany({ where: { auctionPlayerId: lotId } }),
    prisma.auctionPlayer.update({
      where: { id: lotId },
      data: { currentPrice: null, leadingTeamId: null, version: { increment: 1 } },
    }),
    prisma.auction.update({
      where: { id: auctionId },
      data: { status, currentLotEndsAt: endsAt },
    }),
  ]);
  timer.armBidding(auctionId, lotId, endsAt);
}
