import { z } from "zod";
import { FOOTBALL_POSITIONS, type Sport, type FootballPosition } from "./sports.js";
import type { Formation } from "./lots.js";
import type { AcquisitionType } from "./realtime.js";

// ===========================================================================
// Post-auction lineup contracts (Phase 7). Validation rules + error codes live
// in docs/lineup-design.md; the validator is server-side (services/lineup-
// validator.ts) and returns a list of Violations shown live in the builder.
// ===========================================================================

export const LINEUP_STATUSES = ["DRAFT", "LOCKED"] as const;
export type LineupStatus = (typeof LINEUP_STATUSES)[number];

export const LINEUP_MEMBERSHIPS = ["STARTER", "BENCH", "RESERVE"] as const;
export type LineupMembership = (typeof LINEUP_MEMBERSHIPS)[number];

/** Every validation code the validator can emit (see lineup-design.md). */
export const LINEUP_VIOLATIONS = [
  // Shared
  "NOT_IN_SQUAD",
  // Composition
  "XI_SIZE",
  "BATTING_ORDER",
  // Cricket roles
  "MISSING_WK",
  "MISSING_CAPTAIN",
  "MISSING_VICE_CAPTAIN",
  "MISSING_FIRST_BOWLER",
  "MISSING_SECOND_BOWLER",
  "ROLE_NOT_IN_XI",
  "CAPTAIN_EQ_VICE_CAPTAIN",
  "FIRST_EQ_SECOND_BOWLER",
  "WK_IS_BOWLER",
  // Football
  "FORMATION_REQUIRED",
  "FORMATION_NOT_ALLOWED",
  "FORMATION_SIZE",
  "SLOT_DISTRIBUTION",
  "GK_SLOT_INVALID",
  "BENCH_SIZE",
  // Overseas
  "OVERSEAS_CAP",
] as const;
export type LineupViolationCode = (typeof LINEUP_VIOLATIONS)[number];

export interface Violation {
  code: LineupViolationCode;
  detail?: string;
}

// ---- Save payload (client → server) ---------------------------------------

export const lineupMemberSchema = z.object({
  teamPlayerId: z.string().min(1),
  membership: z.enum(LINEUP_MEMBERSHIPS),
  battingOrder: z.coerce.number().int().min(1).max(40).nullable().optional(),
  isWicketkeeper: z.coerce.boolean().default(false),
  isFirstBowler: z.coerce.boolean().default(false),
  isSecondBowler: z.coerce.boolean().default(false),
  isCaptain: z.coerce.boolean().default(false),
  isViceCaptain: z.coerce.boolean().default(false),
  assignedPosition: z.enum(FOOTBALL_POSITIONS).nullable().optional(),
});
export type LineupMemberInput = z.infer<typeof lineupMemberSchema>;

export const saveLineupSchema = z.object({
  formationId: z.string().min(1).nullable().optional(),
  members: z.array(lineupMemberSchema).max(60),
});
export type SaveLineupInput = z.infer<typeof saveLineupSchema>;

// ---- DTOs (server → client) ------------------------------------------------

/** A player in the team's won/assigned squad — the pool the builder draws from. */
export interface SquadPlayer {
  teamPlayerId: string;
  playerId: string;
  playerName: string;
  footballPosition: FootballPosition | null;
  isOverseas: boolean;
  price: string;
  acquiredVia: AcquisitionType;
}

export interface LineupMemberDTO {
  teamPlayerId: string;
  playerId: string;
  playerName: string;
  footballPosition: FootballPosition | null;
  isOverseas: boolean;
  membership: LineupMembership;
  battingOrder: number | null;
  isWicketkeeper: boolean;
  isFirstBowler: boolean;
  isSecondBowler: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  assignedPosition: FootballPosition | null;
}

export interface LineupRulesDTOForBuilder {
  startingSize: number;
  overseasCapEnabled: boolean;
  maxOverseasInXI: number | null;
  requireWicketkeeper: boolean;
  requireCaptain: boolean;
  requireViceCaptain: boolean;
  requireFirstBowler: boolean;
  requireSecondBowler: boolean;
  requireFullBattingOrder: boolean;
  benchSize: number | null;
  editableAfterLockByOwner: boolean;
}

export interface LineupDTO {
  teamId: string;
  teamName: string;
  status: LineupStatus;
  formationId: string | null;
  lockedAt: string | null;
  members: LineupMemberDTO[];
}

/** Everything the builder needs in one GET. */
export interface LineupBuilderData {
  sport: Sport;
  auctionStatus: string;
  canEdit: boolean;
  canLock: boolean;
  rules: LineupRulesDTOForBuilder;
  allowedFormations: Formation[];
  squad: SquadPlayer[];
  lineup: LineupDTO;
  violations: Violation[];
}

export interface SaveLineupResponse {
  lineup: LineupDTO;
  violations: Violation[];
}
