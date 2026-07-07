import type {
  Auction as PrismaAuction,
  AuctionRules,
  LineupRules,
  BidIncrementTier,
  CricketSquadTargets,
} from "@prisma/client";
import type {
  Auction,
  AuctionRulesDTO,
  LineupRulesDTO,
  IncrementTierDTO,
  CricketSquadTargetsDTO,
} from "shared";
import { moneyToWire } from "../../lib/money.js";

type AuctionWithCounts = PrismaAuction & {
  _count?: { teams: number; auctionPlayers: number };
  season?: { name: string; league: { name: string; sport: string } };
};

export function toAuction(a: AuctionWithCounts): Auction {
  return {
    id: a.id,
    name: a.name,
    seasonId: a.seasonId,
    status: a.status,
    biddingMode: a.biddingMode,
    round: a.round,
    autoPilot: a.autoPilot,
    createdAt: a.createdAt.toISOString(),
    teamCount: a._count?.teams,
    lotCount: a._count?.auctionPlayers,
    sport: a.season?.league.sport,
    leagueName: a.season?.league.name,
    seasonName: a.season?.name,
  };
}

export function toRules(r: AuctionRules): AuctionRulesDTO {
  return {
    creditPerTeam: moneyToWire(r.creditPerTeam),
    minPlayersPerTeam: r.minPlayersPerTeam,
    maxPlayersPerTeam: r.maxPlayersPerTeam,
    unsoldPrice: moneyToWire(r.unsoldPrice),
    defaultBasePrice: moneyToWire(r.defaultBasePrice),
    defaultLotDurationSec: r.defaultLotDurationSec,
    maxRetentionsPerTeam: r.maxRetentionsPerTeam,
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

export function toCricketSquadTargets(t: CricketSquadTargets): CricketSquadTargetsDTO {
  return {
    minWicketkeepers: t.minWicketkeepers,
    minBatsmen: t.minBatsmen,
    minOpeners: t.minOpeners,
    minPaceBowlers: t.minPaceBowlers,
    minSpinners: t.minSpinners,
    minAllRounders: t.minAllRounders,
  };
}

export function toTier(t: BidIncrementTier): IncrementTierDTO {
  return { id: t.id, fromAmount: moneyToWire(t.fromAmount), increment: moneyToWire(t.increment) };
}
