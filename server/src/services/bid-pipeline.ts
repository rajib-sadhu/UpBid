import type { BidPlacePayload, BidAcceptedEvent } from "shared";
import type { AuthUser } from "../auth/types.js";
import { prisma } from "../lib/prisma.js";
import { AppError, Errors } from "../lib/errors.js";
import { money, moneyToWire, eq } from "../lib/money.js";
import { canAcceptBid, requiredNextBid } from "./reserve.js";
import { toIncrementTiers, toTeamTally } from "../realtime/mappers.js";

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
    where: { auctionPlayerId, clientBidId: payload.clientBidId },
    select: { id: true },
  });
  if (dup) reject("DUPLICATE_BID", "Duplicate bid ignored");

  // 4) Amount correctness — exact base price or current + required increment.
  const tiers = toIncrementTiers(auction.incrementTiers);
  const amount = money(payload.amount);
  const required = requiredNextBid(lot.currentPrice ?? null, lot.basePrice, tiers);
  if (!eq(amount, required)) {
    reject("BAD_AMOUNT", `Bid must be exactly ${moneyToWire(required)}`);
  }

  // 5) Squad cap.
  if (team.playerCount >= auction.rules.maxPlayersPerTeam) {
    reject("TEAM_FULL", "Team already has the maximum number of players");
  }

  // 6) Reserve / budget.
  const accepts = canAcceptBid(
    {
      creditPerTeam: auction.rules.creditPerTeam,
      committedAmount: team.committedAmount,
      minPlayersPerTeam: auction.rules.minPlayersPerTeam,
      maxPlayersPerTeam: auction.rules.maxPlayersPerTeam,
      playerCount: team.playerCount,
      unsoldPrice: auction.rules.unsoldPrice,
    },
    amount,
  );
  if (!accepts) reject("RESERVE_EXCEEDED", "Bid exceeds the team's available budget");

  // 7) Atomic compare-and-set on version + persist the Bid.
  const bid = await prisma.$transaction(async (tx) => {
    const upd = await tx.auctionPlayer.updateMany({
      where: { id: auctionPlayerId, version: payload.version, status: "ON_BLOCK" },
      data: { currentPrice: amount, leadingTeamId: teamId, version: { increment: 1 } },
    });
    if (upd.count === 0) reject("OUTBID", "Another bid was accepted first");
    return tx.bid.create({
      data: {
        auctionId,
        auctionPlayerId,
        teamId,
        bidderUserId: user.id,
        amount,
        clientBidId: payload.clientBidId,
      },
    });
  });

  // No anti-snipe: endsAt is unchanged. Tallies unchanged → maxBid unchanged.
  const nextRequired = requiredNextBid(amount, lot.basePrice, tiers);
  return {
    auctionPlayerId,
    currentPrice: moneyToWire(amount),
    leadingTeamId: teamId,
    version: payload.version + 1,
    endsAt: auction.currentLotEndsAt ? auction.currentLotEndsAt.toISOString() : null,
    requiredNextBid: moneyToWire(nextRequired),
    bid: {
      teamId,
      bidderUserId: user.id,
      amount: moneyToWire(amount),
      createdAt: bid.createdAt.toISOString(),
    },
    team: toTeamTally(team, auction.rules),
  };
}
