import { z } from "zod";
import { FOOTBALL_POSITIONS } from "./sports.js";
// ===========================================================================
// Post-auction lineup contracts (Phase 7). Validation rules + error codes live
// in docs/lineup-design.md; the validator is server-side (services/lineup-
// validator.ts) and returns a list of Violations shown live in the builder.
// ===========================================================================
export const LINEUP_STATUSES = ["DRAFT", "LOCKED"];
export const LINEUP_MEMBERSHIPS = ["STARTER", "BENCH", "RESERVE"];
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
];
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
export const saveLineupSchema = z.object({
    formationId: z.string().min(1).nullable().optional(),
    members: z.array(lineupMemberSchema).max(60),
});
