import type { LotSoldEvent, LotUnsoldEvent, LotCounts } from "shared";
import { prisma } from "../lib/prisma.js";
import { Errors, AppError } from "../lib/errors.js";
import { toLiveLot, toTeamTally, toLotCounts, type LotWithPlayer } from "../realtime/mappers.js";
import { moneyToWire } from "../lib/money.js";
import * as timer from "../realtime/timer.js";

export type FinalizeResult =
  | { type: "SOLD"; payload: Omit<LotSoldEvent, "seq"> }
  | { type: "UNSOLD"; payload: Omit<LotUnsoldEvent, "seq"> };

async function lotCounts(auctionId: string): Promise<LotCounts> {
  const grouped = await prisma.auctionPlayer.groupBy({
    by: ["status"],
    where: { auctionId },
    _count: true,
  });
  return toLotCounts(grouped.map((g) => ({ status: g.status, _count: g._count })));
}

/**
 * Finalize the lot on the block — always an explicit organizer action (there is
 * no auto-finalize at expiry). SELL commits to the current leader and updates
 * that team's tallies; UNSOLD just closes the lot. Either way the lot leaves the
 * block and the organizer opens the next via LOT_OPEN. (architecture.md §7)
 */
export async function finalizeLot(
  auctionId: string,
  auctionPlayerId: string,
  outcome: "SELL" | "UNSOLD",
): Promise<FinalizeResult> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { rules: true },
  });
  if (!auction) throw Errors.notFound("Auction not found");

  const lot = await prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId } });
  if (!lot || lot.auctionId !== auctionId) throw Errors.notFound("Lot not found");
  if (lot.id !== auction.currentAuctionPlayerId || lot.status !== "ON_BLOCK") {
    throw Errors.invalidState("This lot is not on the block");
  }

  if (outcome === "SELL") {
    if (!lot.leadingTeamId || !lot.currentPrice) {
      throw new AppError("NO_LEADER", "No bid has been placed on this lot", 409);
    }
    const soldPrice = lot.currentPrice;
    const winnerId = lot.leadingTeamId;
    const acquiredVia = lot.round === "RE_AUCTION" ? "REAUCTION" : "AUCTION";

    await prisma.$transaction([
      prisma.auctionPlayer.update({
        where: { id: auctionPlayerId },
        data: { status: "SOLD", soldToTeamId: winnerId, soldPrice },
      }),
      prisma.teamPlayer.create({
        data: {
          teamId: winnerId,
          auctionPlayerId,
          playerId: lot.playerId,
          price: soldPrice,
          acquiredVia,
        },
      }),
      prisma.team.update({
        where: { id: winnerId },
        data: { committedAmount: { increment: soldPrice }, playerCount: { increment: 1 } },
      }),
      prisma.auction.update({
        where: { id: auctionId },
        data: { currentAuctionPlayerId: null, currentLotEndsAt: null },
      }),
    ]);
    timer.stop(auctionId);

    const [updatedLot, team, counts] = await Promise.all([
      prisma.auctionPlayer.findUnique({
        where: { id: auctionPlayerId },
        include: { player: true },
      }),
      prisma.team.findUnique({ where: { id: winnerId } }),
      lotCounts(auctionId),
    ]);

    return {
      type: "SOLD",
      payload: {
        auctionPlayerId,
        soldToTeamId: winnerId,
        soldPrice: moneyToWire(updatedLot!.soldPrice ?? soldPrice),
        team: toTeamTally(team!, auction.rules),
        lotCounts: counts,
        lot: toLiveLot(updatedLot as LotWithPlayer),
      },
    };
  }

  // UNSOLD
  await prisma.$transaction([
    prisma.auctionPlayer.update({ where: { id: auctionPlayerId }, data: { status: "UNSOLD" } }),
    prisma.auction.update({
      where: { id: auctionId },
      data: { currentAuctionPlayerId: null, currentLotEndsAt: null },
    }),
  ]);
  timer.stop(auctionId);

  const [updatedLot, counts] = await Promise.all([
    prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId }, include: { player: true } }),
    lotCounts(auctionId),
  ]);

  return {
    type: "UNSOLD",
    payload: {
      auctionPlayerId,
      lotCounts: counts,
      lot: toLiveLot(updatedLot as LotWithPlayer),
    },
  };
}

/**
 * Organizer correction: undo the most recent SALE in the auction. Deletes the
 * TeamPlayer, refunds the winner (committedAmount/playerCount), and puts the lot
 * back ON_BLOCK in its exact pre-sell state (currentPrice = soldPrice, leader =
 * winner) with a fresh timer, so the organizer can re-bid, undo the bid, sell to
 * the right team, or mark it unsold. Bid history is kept (only the TeamPlayer is
 * removed). Requires an empty block — the one-lot-on-the-block invariant. The
 * caller rebroadcasts a fresh snapshot.
 */
export async function reverseLastSale(auctionId: string): Promise<void> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { rules: true },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  if (auction.status !== "LIVE" && auction.status !== "RE_AUCTION") {
    throw Errors.invalidState("Sales can only be reversed during a live round");
  }
  if (auction.currentAuctionPlayerId) {
    throw Errors.invalidState("Finalize the current lot before reversing a sale");
  }
  if (!auction.rules) throw Errors.invalidState("Auction has no rules configured");

  const sale = await prisma.teamPlayer.findFirst({
    where: { auctionPlayer: { auctionId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { auctionPlayer: true },
  });
  if (!sale) throw new AppError("NO_SALE", "There is no sale to reverse", 409);
  const lot = sale.auctionPlayer;
  if (lot.status !== "SOLD" || !lot.soldToTeamId || !lot.soldPrice) {
    throw new AppError("NO_SALE", "The most recent acquisition is not a reversible sale", 409);
  }

  const endsAt = new Date(Date.now() + auction.rules.defaultLotDurationSec * 1000);
  await prisma.$transaction([
    prisma.teamPlayer.delete({ where: { id: sale.id } }),
    prisma.team.update({
      where: { id: lot.soldToTeamId },
      data: { committedAmount: { decrement: lot.soldPrice }, playerCount: { decrement: 1 } },
    }),
    prisma.auctionPlayer.update({
      where: { id: lot.id },
      data: {
        status: "ON_BLOCK",
        currentPrice: lot.soldPrice,
        leadingTeamId: lot.soldToTeamId,
        soldPrice: null,
        soldToTeamId: null,
        version: { increment: 1 },
      },
    }),
    prisma.auction.update({
      where: { id: auctionId },
      data: { currentAuctionPlayerId: lot.id, currentLotEndsAt: endsAt },
    }),
  ]);
  timer.armBidding(auctionId, lot.id, endsAt);
}

/**
 * Organizer correction: send a finished lot (SOLD or UNSOLD) back onto the block
 * for a FRESH auction — base price, no leader, all prior bids wiped, fresh full
 * timer. If it was sold, the sale is reversed first (TeamPlayer removed, winner
 * refunded). Unlike reverseLastSale this does NOT restore the old leader/price —
 * it restarts from scratch. Requires an empty block. Caller rebroadcasts a
 * fresh snapshot.
 */
export async function rebidLot(auctionId: string, auctionPlayerId: string): Promise<void> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { rules: true },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  if (auction.status !== "LIVE" && auction.status !== "RE_AUCTION") {
    throw Errors.invalidState("Lots can only be re-bid during a live round");
  }
  if (auction.currentAuctionPlayerId) {
    throw Errors.invalidState("Finalize the current lot before re-bidding another");
  }
  if (!auction.rules) throw Errors.invalidState("Auction has no rules configured");

  const lot = await prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId } });
  if (!lot || lot.auctionId !== auctionId) throw Errors.notFound("Lot not found");
  if (lot.status !== "SOLD" && lot.status !== "UNSOLD") {
    throw Errors.invalidState("Only a sold or unsold lot can be sent back for re-bidding");
  }

  const endsAt = new Date(Date.now() + auction.rules.defaultLotDurationSec * 1000);
  await prisma.$transaction(async (tx) => {
    if (lot.status === "SOLD" && lot.soldToTeamId && lot.soldPrice) {
      await tx.teamPlayer.deleteMany({ where: { auctionPlayerId } });
      await tx.team.update({
        where: { id: lot.soldToTeamId },
        data: { committedAmount: { decrement: lot.soldPrice }, playerCount: { decrement: 1 } },
      });
    }
    await tx.bid.deleteMany({ where: { auctionPlayerId } });
    await tx.auctionPlayer.update({
      where: { id: auctionPlayerId },
      data: {
        status: "ON_BLOCK",
        currentPrice: null,
        leadingTeamId: null,
        soldPrice: null,
        soldToTeamId: null,
        version: { increment: 1 },
      },
    });
    await tx.auction.update({
      where: { id: auctionId },
      data: { currentAuctionPlayerId: auctionPlayerId, currentLotEndsAt: endsAt },
    });
  });
  timer.armBidding(auctionId, auctionPlayerId, endsAt);
}
