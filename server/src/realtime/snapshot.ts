import type { StateSnapshot } from "shared";
import { prisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";
import { moneyToWire } from "../lib/money.js";
import { currentSeq } from "./broadcast.js";
import { resolveInfo } from "./timer.js";
import {
  toIncrementTiers,
  toSnapshotTeam,
  toCurrentLot,
  toLiveLot,
  toLotCounts,
  type LotWithPlayer,
} from "./mappers.js";

/**
 * Build the complete, current state of an auction for a joining/reconnecting
 * client. Authoritative — the client replaces its local state with this. seq is
 * the *current* counter (not advanced); deltas after this carry seq+1, seq+2…
 */
export async function buildStateSnapshot(auctionId: string): Promise<StateSnapshot> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      rules: true,
      incrementTiers: { orderBy: { fromAmount: "asc" } },
      teams: { orderBy: { createdAt: "asc" } },
      currentAuctionPlayer: { include: { player: true } },
    },
  });
  if (!auction) throw Errors.notFound("Auction not found");

  const [grouped, lotRows] = await Promise.all([
    prisma.auctionPlayer.groupBy({
      by: ["status"],
      where: { auctionId },
      _count: true,
    }),
    prisma.auctionPlayer.findMany({
      where: { auctionId },
      orderBy: [{ lotOrder: "asc" }, { createdAt: "asc" }],
      include: { player: true },
    }),
  ]);

  const tiers = toIncrementTiers(auction.incrementTiers);
  const timerInfo = resolveInfo(auction);
  const currentLot = auction.currentAuctionPlayer
    ? toCurrentLot(auction.currentAuctionPlayer as LotWithPlayer, tiers, timerInfo)
    : null;

  return {
    seq: currentSeq(auctionId),
    auction: {
      id: auction.id,
      name: auction.name,
      status: auction.status,
      round: auction.round,
      biddingMode: auction.biddingMode,
    },
    rules: auction.rules
      ? {
          creditPerTeam: moneyToWire(auction.rules.creditPerTeam),
          minPlayersPerTeam: auction.rules.minPlayersPerTeam,
          maxPlayersPerTeam: auction.rules.maxPlayersPerTeam,
          unsoldPrice: moneyToWire(auction.rules.unsoldPrice),
          defaultLotDurationSec: auction.rules.defaultLotDurationSec,
        }
      : null,
    incrementTiers: auction.incrementTiers.map((t) => ({
      fromAmount: moneyToWire(t.fromAmount),
      increment: moneyToWire(t.increment),
    })),
    teams: auction.teams.map((t) => toSnapshotTeam(t, auction.rules)),
    currentLot,
    lots: {
      counts: toLotCounts(grouped.map((g) => ({ status: g.status, _count: g._count }))),
      items: (lotRows as LotWithPlayer[]).map(toLiveLot),
    },
    serverTime: new Date().toISOString(),
  };
}
