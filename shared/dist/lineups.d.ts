import { z } from "zod";
import { type Sport, type FootballPosition } from "./sports.js";
import type { Formation } from "./lots.js";
import type { AcquisitionType } from "./realtime.js";
export declare const LINEUP_STATUSES: readonly ["DRAFT", "LOCKED"];
export type LineupStatus = (typeof LINEUP_STATUSES)[number];
export declare const LINEUP_MEMBERSHIPS: readonly ["STARTER", "BENCH", "RESERVE"];
export type LineupMembership = (typeof LINEUP_MEMBERSHIPS)[number];
/** Every validation code the validator can emit (see lineup-design.md). */
export declare const LINEUP_VIOLATIONS: readonly ["NOT_IN_SQUAD", "XI_SIZE", "BATTING_ORDER", "MISSING_WK", "MISSING_CAPTAIN", "MISSING_VICE_CAPTAIN", "MISSING_FIRST_BOWLER", "MISSING_SECOND_BOWLER", "ROLE_NOT_IN_XI", "CAPTAIN_EQ_VICE_CAPTAIN", "FIRST_EQ_SECOND_BOWLER", "WK_IS_BOWLER", "FORMATION_REQUIRED", "FORMATION_NOT_ALLOWED", "FORMATION_SIZE", "SLOT_DISTRIBUTION", "GK_SLOT_INVALID", "BENCH_SIZE", "OVERSEAS_CAP"];
export type LineupViolationCode = (typeof LINEUP_VIOLATIONS)[number];
export interface Violation {
    code: LineupViolationCode;
    detail?: string;
}
export declare const lineupMemberSchema: z.ZodObject<{
    teamPlayerId: z.ZodString;
    membership: z.ZodEnum<["STARTER", "BENCH", "RESERVE"]>;
    battingOrder: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    isWicketkeeper: z.ZodDefault<z.ZodBoolean>;
    isFirstBowler: z.ZodDefault<z.ZodBoolean>;
    isSecondBowler: z.ZodDefault<z.ZodBoolean>;
    isCaptain: z.ZodDefault<z.ZodBoolean>;
    isViceCaptain: z.ZodDefault<z.ZodBoolean>;
    assignedPosition: z.ZodOptional<z.ZodNullable<z.ZodEnum<["GK", "DEF", "MID", "FWD"]>>>;
}, "strip", z.ZodTypeAny, {
    teamPlayerId: string;
    membership: "STARTER" | "BENCH" | "RESERVE";
    isWicketkeeper: boolean;
    isFirstBowler: boolean;
    isSecondBowler: boolean;
    isCaptain: boolean;
    isViceCaptain: boolean;
    battingOrder?: number | null | undefined;
    assignedPosition?: "GK" | "DEF" | "MID" | "FWD" | null | undefined;
}, {
    teamPlayerId: string;
    membership: "STARTER" | "BENCH" | "RESERVE";
    battingOrder?: number | null | undefined;
    isWicketkeeper?: boolean | undefined;
    isFirstBowler?: boolean | undefined;
    isSecondBowler?: boolean | undefined;
    isCaptain?: boolean | undefined;
    isViceCaptain?: boolean | undefined;
    assignedPosition?: "GK" | "DEF" | "MID" | "FWD" | null | undefined;
}>;
export type LineupMemberInput = z.infer<typeof lineupMemberSchema>;
export declare const saveLineupSchema: z.ZodObject<{
    formationId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    members: z.ZodArray<z.ZodObject<{
        teamPlayerId: z.ZodString;
        membership: z.ZodEnum<["STARTER", "BENCH", "RESERVE"]>;
        battingOrder: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        isWicketkeeper: z.ZodDefault<z.ZodBoolean>;
        isFirstBowler: z.ZodDefault<z.ZodBoolean>;
        isSecondBowler: z.ZodDefault<z.ZodBoolean>;
        isCaptain: z.ZodDefault<z.ZodBoolean>;
        isViceCaptain: z.ZodDefault<z.ZodBoolean>;
        assignedPosition: z.ZodOptional<z.ZodNullable<z.ZodEnum<["GK", "DEF", "MID", "FWD"]>>>;
    }, "strip", z.ZodTypeAny, {
        teamPlayerId: string;
        membership: "STARTER" | "BENCH" | "RESERVE";
        isWicketkeeper: boolean;
        isFirstBowler: boolean;
        isSecondBowler: boolean;
        isCaptain: boolean;
        isViceCaptain: boolean;
        battingOrder?: number | null | undefined;
        assignedPosition?: "GK" | "DEF" | "MID" | "FWD" | null | undefined;
    }, {
        teamPlayerId: string;
        membership: "STARTER" | "BENCH" | "RESERVE";
        battingOrder?: number | null | undefined;
        isWicketkeeper?: boolean | undefined;
        isFirstBowler?: boolean | undefined;
        isSecondBowler?: boolean | undefined;
        isCaptain?: boolean | undefined;
        isViceCaptain?: boolean | undefined;
        assignedPosition?: "GK" | "DEF" | "MID" | "FWD" | null | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    members: {
        teamPlayerId: string;
        membership: "STARTER" | "BENCH" | "RESERVE";
        isWicketkeeper: boolean;
        isFirstBowler: boolean;
        isSecondBowler: boolean;
        isCaptain: boolean;
        isViceCaptain: boolean;
        battingOrder?: number | null | undefined;
        assignedPosition?: "GK" | "DEF" | "MID" | "FWD" | null | undefined;
    }[];
    formationId?: string | null | undefined;
}, {
    members: {
        teamPlayerId: string;
        membership: "STARTER" | "BENCH" | "RESERVE";
        battingOrder?: number | null | undefined;
        isWicketkeeper?: boolean | undefined;
        isFirstBowler?: boolean | undefined;
        isSecondBowler?: boolean | undefined;
        isCaptain?: boolean | undefined;
        isViceCaptain?: boolean | undefined;
        assignedPosition?: "GK" | "DEF" | "MID" | "FWD" | null | undefined;
    }[];
    formationId?: string | null | undefined;
}>;
export type SaveLineupInput = z.infer<typeof saveLineupSchema>;
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
