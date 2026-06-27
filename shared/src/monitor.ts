import type { Sport } from "./sports.js";
import type { AuctionStatus, AuctionRound, BiddingMode } from "./auctions.js";
import type { AcquisitionType } from "./realtime.js";
import type { LineupStatus } from "./lineups.js";

// Read models for Phase 8 dashboards & tracking. These are NON-realtime,
// comprehensive snapshots usable at ANY auction status (the live snapshot in
// realtime.ts is the source of truth while bidding; this fills in full squads,
// per-team budget headroom and lineup state for the monitor / team views).

export interface MonitorSquadPlayer {
  teamPlayerId: string;
  playerId: string;
  playerName: string;
  photoUrl: string | null;
  role: string | null;
  footballPosition: string | null;
  isOverseas: boolean;
  /** Crore-units string. */
  price: string;
  acquiredVia: AcquisitionType;
}

export interface MonitorTeam {
  id: string;
  name: string;
  shortName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  /** Spent so far (string crore units). */
  committedAmount: string;
  /** creditPerTeam − committedAmount (string crore units). */
  remainingCredit: string;
  /** Reserve-aware cap for the next bid (string crore units). */
  maxBid: string;
  playerCount: number;
  /** maxPlayersPerTeam − playerCount (squad slots still open). */
  slotsRemaining: number;
  /** True while the team is below minPlayersPerTeam. */
  belowMinimum: boolean;
  lineupStatus: LineupStatus | "NONE";
  squad: MonitorSquadPlayer[];
}

export interface MonitorProgress {
  PENDING: number;
  ON_BLOCK: number;
  SOLD: number;
  UNSOLD: number;
  ASSIGNED: number;
  total: number;
}

export interface MonitorRules {
  creditPerTeam: string;
  minPlayersPerTeam: number;
  maxPlayersPerTeam: number;
  unsoldPrice: string;
}

export interface AuctionMonitor {
  auctionId: string;
  name: string;
  sport: Sport;
  status: AuctionStatus;
  round: AuctionRound;
  biddingMode: BiddingMode;
  leagueName: string;
  seasonName: string;
  rules: MonitorRules | null;
  progress: MonitorProgress;
  teams: MonitorTeam[];
  /** True for the organizer-owner / super-admin (may also control the auction). */
  canManage: boolean;
}

// ---- Franchise "my teams" view ---------------------------------------------

export interface MyTeamSummary {
  teamId: string;
  teamName: string;
  shortName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  auctionId: string;
  auctionName: string;
  auctionStatus: AuctionStatus;
  sport: Sport;
  committedAmount: string;
  remainingCredit: string;
  playerCount: number;
  belowMinimum: boolean;
  lineupStatus: LineupStatus | "NONE";
}
