import type {
  Auction as PrismaAuction,
  AuctionRules,
  LineupRules,
  BidIncrementTier,
} from "@prisma/client";
import type { Auction, AuctionRulesDTO, LineupRulesDTO, IncrementTierDTO } from "shared";
import { moneyToWire } from "../../lib/money.js";

type AuctionWithCounts = PrismaAuction & {
  _count?: { teams: number; auctionPlayers: number };
};

export function toAuction(a: AuctionWithCounts): Auction {
  return {
    id: a.id,
    name: a.name,
    seasonId: a.seasonId,
    status: a.status,
    biddingMode: a.biddingMode,
    round: a.round,
    createdAt: a.createdAt.toISOString(),
    teamCount: a._count?.teams,
    lotCount: a._count?.auctionPlayers,
  };
}

export function toRules(r: AuctionRules): AuctionRulesDTO {
  return {
    creditPerTeam: moneyToWire(r.creditPerTeam),
    minPlayersPerTeam: r.minPlayersPerTeam,
    maxPlayersPerTeam: r.maxPlayersPerTeam,
    minTeams: r.minTeams,
    maxTeams: r.maxTeams,
    unsoldPrice: moneyToWire(r.unsoldPrice),
    defaultLotDurationSec: r.defaultLotDurationSec,
  };
}

export function toLineupRules(l: LineupRules): LineupRulesDTO {
  return {
    startingSize: l.startingSize,
    overseasCapEnabled: l.overseasCapEnabled,
    maxOverseasInXI: l.maxOverseasInXI,
    requireWicketkeeper: l.requireWicketkeeper,
    requireCaptain: l.requireCaptain,
    requireViceCaptain: l.requireViceCaptain,
    requireFirstBowler: l.requireFirstBowler,
    requireSecondBowler: l.requireSecondBowler,
    requireFullBattingOrder: l.requireFullBattingOrder,
    benchSize: l.benchSize,
    editableAfterLockByOwner: l.editableAfterLockByOwner,
  };
}

export function toTier(t: BidIncrementTier): IncrementTierDTO {
  return { id: t.id, fromAmount: moneyToWire(t.fromAmount), increment: moneyToWire(t.increment) };
}
