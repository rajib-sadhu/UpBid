import type {
  AuctionPlayer,
  Player,
  Team,
  Franchise,
  AuctionRules,
  BidIncrementTier,
} from "@prisma/client";
import type { SnapshotTeam, TeamTally, CurrentLot, LiveLot, LotCounts } from "shared";
import { moneyToWire, type Money } from "../lib/money.js";
import { maxBid, requiredNextBid, openingPrice, type IncrementTier } from "../services/reserve.js";
import type { TimerInfo } from "./timer.js";

export type LotWithPlayer = AuctionPlayer & { player: Player };

// Team identity (name/short/color/logo/owner) lives on the league Franchise.
export type TeamFranchiseInfo = Pick<
  Franchise,
  "name" | "shortName" | "primaryColor" | "secondaryColor" | "logoUrl" | "ownerUserId"
>;
export type TeamWithFranchise = Team & { franchise: TeamFranchiseInfo };

/** Decimal-typed increment tiers for the reserve helpers. */
export function toIncrementTiers(tiers: BidIncrementTier[]): IncrementTier[] {
  return tiers.map((t) => ({ fromAmount: t.fromAmount, increment: t.increment }));
}

export function teamMaxBid(team: Team, rules: AuctionRules): string {
  return moneyToWire(
    maxBid({
      creditPerTeam: rules.creditPerTeam,
      committedAmount: team.committedAmount,
      minPlayersPerTeam: rules.minPlayersPerTeam,
      maxPlayersPerTeam: rules.maxPlayersPerTeam,
      playerCount: team.playerCount,
      unsoldPrice: rules.unsoldPrice,
    }),
  );
}

export function toSnapshotTeam(team: TeamWithFranchise, rules: AuctionRules | null): SnapshotTeam {
  return {
    id: team.id,
    name: team.franchise.name,
    shortName: team.franchise.shortName,
    primaryColor: team.franchise.primaryColor,
    secondaryColor: team.franchise.secondaryColor,
    logoUrl: team.franchise.logoUrl,
    ownerUserId: team.franchise.ownerUserId,
    committedAmount: moneyToWire(team.committedAmount),
    playerCount: team.playerCount,
    maxBid: rules ? teamMaxBid(team, rules) : "0.0000",
  };
}

export function toTeamTally(team: Team, rules: AuctionRules | null): TeamTally {
  return {
    id: team.id,
    committedAmount: moneyToWire(team.committedAmount),
    playerCount: team.playerCount,
    maxBid: rules ? teamMaxBid(team, rules) : "0.0000",
  };
}

export function toCurrentLot(
  lot: LotWithPlayer,
  tiers: IncrementTier[],
  info: TimerInfo,
  unsoldPrice: Money,
): CurrentLot {
  return {
    auctionPlayerId: lot.id,
    playerId: lot.playerId,
    playerName: lot.player.name,
    photoUrl: lot.player.photoUrl,
    isOverseas: lot.isOverseas,
    basePrice: moneyToWire(lot.basePrice),
    sport: lot.player.sport,
    nationality: lot.player.nationality,
    role: lot.player.role,
    cricketRole: lot.player.cricketRole,
    battingPosition: lot.player.battingPosition,
    bowlingStyle: lot.player.bowlingStyle,
    allRounderType: lot.player.allRounderType,
    footballPosition: lot.player.footballPosition,
    footballDetailPosition: lot.player.footballDetailPosition,
    status: lot.status,
    round: lot.round,
    currentPrice: lot.currentPrice ? moneyToWire(lot.currentPrice) : null,
    leadingTeamId: lot.leadingTeamId,
    requiredNextBid: moneyToWire(
      requiredNextBid(
        lot.currentPrice ?? null,
        openingPrice(lot.round, lot.basePrice, unsoldPrice),
        tiers,
      ),
    ),
    version: lot.version,
    timerState: info.state,
    endsAt: info.endsAt ? info.endsAt.toISOString() : null,
    remainingMs: info.remainingMs,
  };
}

export function toLiveLot(lot: LotWithPlayer): LiveLot {
  return {
    auctionPlayerId: lot.id,
    playerId: lot.playerId,
    playerName: lot.player.name,
    photoUrl: lot.player.photoUrl,
    isOverseas: lot.isOverseas,
    basePrice: moneyToWire(lot.basePrice),
    status: lot.status,
    round: lot.round,
    lotOrder: lot.lotOrder,
    soldPrice: lot.soldPrice ? moneyToWire(lot.soldPrice) : null,
    soldToTeamId: lot.soldToTeamId,
    cricketRole: lot.player.cricketRole,
    bowlingStyle: lot.player.bowlingStyle,
  };
}

const EMPTY_COUNTS: LotCounts = {
  PENDING: 0,
  ON_BLOCK: 0,
  SOLD: 0,
  UNSOLD: 0,
  ASSIGNED: 0,
  RETAINED: 0,
};

/** Fold a Prisma groupBy(status) result into the LotCounts shape. */
export function toLotCounts(grouped: { status: keyof LotCounts; _count: number }[]): LotCounts {
  const counts: LotCounts = { ...EMPTY_COUNTS };
  for (const g of grouped) counts[g.status] = g._count;
  return counts;
}
