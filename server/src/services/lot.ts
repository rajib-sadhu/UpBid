import type { CurrentLot } from "shared";
import { prisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";
import { toCurrentLot, toIncrementTiers, type LotWithPlayer } from "../realtime/mappers.js";

/**
 * Put a PENDING lot ON_BLOCK and set its end time. Returns the lot DTO (timer
 * state BIDDING) and the endsAt for the caller to arm the in-memory timer and
 * broadcast LOT_OPENED. Only one lot may be on the block at a time.
 */
export async function openLot(
  auctionId: string,
  auctionPlayerId: string,
): Promise<{ currentLot: CurrentLot; endsAt: Date }> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { rules: true, incrementTiers: { orderBy: { fromAmount: "asc" } } },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  if (!auction.rules) throw Errors.invalidState("Auction has no rules configured");
  if (auction.status !== "LIVE" && auction.status !== "RE_AUCTION") {
    throw Errors.invalidState("Lots can only be opened during a live round");
  }
  if (auction.currentAuctionPlayerId) {
    throw Errors.invalidState("Finalize the current lot before opening another");
  }

  const lot = await prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId } });
  if (!lot || lot.auctionId !== auctionId) throw Errors.notFound("Lot not found");
  if (lot.status !== "PENDING") throw Errors.invalidState("Lot is not available to open");

  const endsAt = new Date(Date.now() + auction.rules.defaultLotDurationSec * 1000);
  await prisma.$transaction([
    prisma.auctionPlayer.update({
      where: { id: auctionPlayerId },
      data: { status: "ON_BLOCK", currentPrice: null, leadingTeamId: null },
    }),
    prisma.auction.update({
      where: { id: auctionId },
      data: { currentAuctionPlayerId: auctionPlayerId, currentLotEndsAt: endsAt },
    }),
  ]);

  const opened = await prisma.auctionPlayer.findUniqueOrThrow({
    where: { id: auctionPlayerId },
    include: { player: true },
  });
  const currentLot = toCurrentLot(
    opened as LotWithPlayer,
    toIncrementTiers(auction.incrementTiers),
    {
      state: "BIDDING",
      endsAt,
      remainingMs: null,
    },
  );
  return { currentLot, endsAt };
}
