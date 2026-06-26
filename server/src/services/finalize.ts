import type { LotSoldEvent, LotUnsoldEvent, LotCounts } from "shared";
import { prisma } from "../lib/prisma.js";
import { Errors, AppError } from "../lib/errors.js";
import { toLiveLot, toTeamTally, toLotCounts, type LotWithPlayer } from "../realtime/mappers.js";
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
        soldPrice: (updatedLot!.soldPrice ?? soldPrice).toFixed(4),
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
