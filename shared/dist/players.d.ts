import { z } from "zod";
import type { Sport, FootballPosition, FootballDetailPosition } from "./sports.js";
export declare const CRICKET_ROLES: readonly ["BATSMAN", "BOWLER", "WICKETKEEPER", "ALL_ROUNDER"];
export type CricketRole = (typeof CRICKET_ROLES)[number];
export declare const BATTING_POSITIONS: readonly ["OPENER", "MIDDLE", "LOWER"];
export type BattingPosition = (typeof BATTING_POSITIONS)[number];
export declare const BOWLING_STYLES: readonly ["FAST", "MEDIUM_FAST", "SPINNER"];
export type BowlingStyle = (typeof BOWLING_STYLES)[number];
export declare const ALL_ROUNDER_TYPES: readonly ["ALL_ROUNDER", "BATTING", "BOWLING"];
export type AllRounderType = (typeof ALL_ROUNDER_TYPES)[number];
/** Human-readable labels for display + form option text. */
export declare const CRICKET_ROLE_LABELS: Record<CricketRole, string>;
export declare const BATTING_POSITION_LABELS: Record<BattingPosition, string>;
export declare const BOWLING_STYLE_LABELS: Record<BowlingStyle, string>;
export declare const ALL_ROUNDER_TYPE_LABELS: Record<AllRounderType, string>;
/** Does a cricket playing role need a bowling style? */
export declare function roleNeedsBowlingStyle(role: CricketRole): boolean;
export declare const PLAYER_SORT_FIELDS: readonly ["name", "sport", "nationality", "dateOfBirth", "externalRef", "createdAt", "role", "cricketRole", "battingPosition", "bowlingStyle", "allRounderType", "footballPosition", "footballDetailPosition"];
export type PlayerSortField = (typeof PLAYER_SORT_FIELDS)[number];
export declare const playerQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    sport: z.ZodOptional<z.ZodEnum<["CRICKET", "FOOTBALL", "BASKETBALL", "OTHER"]>>;
    sort: z.ZodDefault<z.ZodEnum<["name", "sport", "nationality", "dateOfBirth", "externalRef", "createdAt", "role", "cricketRole", "battingPosition", "bowlingStyle", "allRounderType", "footballPosition", "footballDetailPosition"]>>;
    dir: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
}, "strip", z.ZodTypeAny, {
    sort: "name" | "sport" | "nationality" | "dateOfBirth" | "externalRef" | "createdAt" | "role" | "cricketRole" | "battingPosition" | "bowlingStyle" | "allRounderType" | "footballPosition" | "footballDetailPosition";
    page: number;
    pageSize: number;
    dir: "asc" | "desc";
    q?: string | undefined;
    sport?: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER" | undefined;
}, {
    sort?: "name" | "sport" | "nationality" | "dateOfBirth" | "externalRef" | "createdAt" | "role" | "cricketRole" | "battingPosition" | "bowlingStyle" | "allRounderType" | "footballPosition" | "footballDetailPosition" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    sport?: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER" | undefined;
    dir?: "asc" | "desc" | undefined;
}>;
export type PlayerQuery = z.infer<typeof playerQuerySchema>;
export declare const LEAGUE_PLAYER_SORT_FIELDS: readonly ["name", "banned"];
export type LeaguePlayerSortField = (typeof LEAGUE_PLAYER_SORT_FIELDS)[number];
export declare const leaguePlayerQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    sort: z.ZodDefault<z.ZodEnum<["name", "banned"]>>;
    dir: z.ZodDefault<z.ZodEnum<["asc", "desc"]>>;
}, "strip", z.ZodTypeAny, {
    sort: "name" | "banned";
    page: number;
    pageSize: number;
    dir: "asc" | "desc";
    q?: string | undefined;
}, {
    sort?: "name" | "banned" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    dir?: "asc" | "desc" | undefined;
}>;
export type LeaguePlayerQuery = z.infer<typeof leaguePlayerQuerySchema>;
export declare const createPlayerSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    sport: z.ZodEnum<["CRICKET", "FOOTBALL", "BASKETBALL", "OTHER"]>;
    role: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    nationality: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    dateOfBirth: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    externalRef: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    photoUrl: z.ZodUnion<[z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>, z.ZodLiteral<"">]>;
    footballPosition: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["GK", "DEF", "MID", "FWD"]>>, z.ZodLiteral<"">]>;
    footballDetailPosition: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["GK", "RB", "CB", "LB", "DMF", "CMF", "AMF", "LW", "RW", "ST"]>>, z.ZodLiteral<"">]>;
    cricketRole: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["BATSMAN", "BOWLER", "WICKETKEEPER", "ALL_ROUNDER"]>>, z.ZodLiteral<"">]>;
    battingPosition: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["OPENER", "MIDDLE", "LOWER"]>>, z.ZodLiteral<"">]>;
    bowlingStyle: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["FAST", "MEDIUM_FAST", "SPINNER"]>>, z.ZodLiteral<"">]>;
    allRounderType: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["ALL_ROUNDER", "BATTING", "BOWLING"]>>, z.ZodLiteral<"">]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    role?: string | undefined;
    cricketRole?: "" | "BATSMAN" | "BOWLER" | "WICKETKEEPER" | "ALL_ROUNDER" | undefined;
    battingPosition?: "" | "OPENER" | "MIDDLE" | "LOWER" | undefined;
    bowlingStyle?: "" | "FAST" | "MEDIUM_FAST" | "SPINNER" | undefined;
    allRounderType?: "" | "ALL_ROUNDER" | "BATTING" | "BOWLING" | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
    footballDetailPosition?: "" | "GK" | "RB" | "CB" | "LB" | "DMF" | "CMF" | "AMF" | "LW" | "RW" | "ST" | undefined;
    photoUrl?: string | undefined;
}, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    role?: string | undefined;
    cricketRole?: "" | "BATSMAN" | "BOWLER" | "WICKETKEEPER" | "ALL_ROUNDER" | undefined;
    battingPosition?: "" | "OPENER" | "MIDDLE" | "LOWER" | undefined;
    bowlingStyle?: "" | "FAST" | "MEDIUM_FAST" | "SPINNER" | undefined;
    allRounderType?: "" | "ALL_ROUNDER" | "BATTING" | "BOWLING" | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
    footballDetailPosition?: "" | "GK" | "RB" | "CB" | "LB" | "DMF" | "CMF" | "AMF" | "LW" | "RW" | "ST" | undefined;
    photoUrl?: string | undefined;
}>, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    role?: string | undefined;
    cricketRole?: "" | "BATSMAN" | "BOWLER" | "WICKETKEEPER" | "ALL_ROUNDER" | undefined;
    battingPosition?: "" | "OPENER" | "MIDDLE" | "LOWER" | undefined;
    bowlingStyle?: "" | "FAST" | "MEDIUM_FAST" | "SPINNER" | undefined;
    allRounderType?: "" | "ALL_ROUNDER" | "BATTING" | "BOWLING" | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
    footballDetailPosition?: "" | "GK" | "RB" | "CB" | "LB" | "DMF" | "CMF" | "AMF" | "LW" | "RW" | "ST" | undefined;
    photoUrl?: string | undefined;
}, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    role?: string | undefined;
    cricketRole?: "" | "BATSMAN" | "BOWLER" | "WICKETKEEPER" | "ALL_ROUNDER" | undefined;
    battingPosition?: "" | "OPENER" | "MIDDLE" | "LOWER" | undefined;
    bowlingStyle?: "" | "FAST" | "MEDIUM_FAST" | "SPINNER" | undefined;
    allRounderType?: "" | "ALL_ROUNDER" | "BATTING" | "BOWLING" | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
    footballDetailPosition?: "" | "GK" | "RB" | "CB" | "LB" | "DMF" | "CMF" | "AMF" | "LW" | "RW" | "ST" | undefined;
    photoUrl?: string | undefined;
}>, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    role?: string | undefined;
    cricketRole?: "" | "BATSMAN" | "BOWLER" | "WICKETKEEPER" | "ALL_ROUNDER" | undefined;
    battingPosition?: "" | "OPENER" | "MIDDLE" | "LOWER" | undefined;
    bowlingStyle?: "" | "FAST" | "MEDIUM_FAST" | "SPINNER" | undefined;
    allRounderType?: "" | "ALL_ROUNDER" | "BATTING" | "BOWLING" | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
    footballDetailPosition?: "" | "GK" | "RB" | "CB" | "LB" | "DMF" | "CMF" | "AMF" | "LW" | "RW" | "ST" | undefined;
    photoUrl?: string | undefined;
}, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    role?: string | undefined;
    cricketRole?: "" | "BATSMAN" | "BOWLER" | "WICKETKEEPER" | "ALL_ROUNDER" | undefined;
    battingPosition?: "" | "OPENER" | "MIDDLE" | "LOWER" | undefined;
    bowlingStyle?: "" | "FAST" | "MEDIUM_FAST" | "SPINNER" | undefined;
    allRounderType?: "" | "ALL_ROUNDER" | "BATTING" | "BOWLING" | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
    footballDetailPosition?: "" | "GK" | "RB" | "CB" | "LB" | "DMF" | "CMF" | "AMF" | "LW" | "RW" | "ST" | undefined;
    photoUrl?: string | undefined;
}>;
export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export declare const updatePlayerSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    sport: z.ZodEnum<["CRICKET", "FOOTBALL", "BASKETBALL", "OTHER"]>;
    role: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    nationality: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    dateOfBirth: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    externalRef: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    photoUrl: z.ZodUnion<[z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>, z.ZodLiteral<"">]>;
    footballPosition: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["GK", "DEF", "MID", "FWD"]>>, z.ZodLiteral<"">]>;
    footballDetailPosition: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["GK", "RB", "CB", "LB", "DMF", "CMF", "AMF", "LW", "RW", "ST"]>>, z.ZodLiteral<"">]>;
    cricketRole: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["BATSMAN", "BOWLER", "WICKETKEEPER", "ALL_ROUNDER"]>>, z.ZodLiteral<"">]>;
    battingPosition: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["OPENER", "MIDDLE", "LOWER"]>>, z.ZodLiteral<"">]>;
    bowlingStyle: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["FAST", "MEDIUM_FAST", "SPINNER"]>>, z.ZodLiteral<"">]>;
    allRounderType: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["ALL_ROUNDER", "BATTING", "BOWLING"]>>, z.ZodLiteral<"">]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    role?: string | undefined;
    cricketRole?: "" | "BATSMAN" | "BOWLER" | "WICKETKEEPER" | "ALL_ROUNDER" | undefined;
    battingPosition?: "" | "OPENER" | "MIDDLE" | "LOWER" | undefined;
    bowlingStyle?: "" | "FAST" | "MEDIUM_FAST" | "SPINNER" | undefined;
    allRounderType?: "" | "ALL_ROUNDER" | "BATTING" | "BOWLING" | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
    footballDetailPosition?: "" | "GK" | "RB" | "CB" | "LB" | "DMF" | "CMF" | "AMF" | "LW" | "RW" | "ST" | undefined;
    photoUrl?: string | undefined;
}, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    role?: string | undefined;
    cricketRole?: "" | "BATSMAN" | "BOWLER" | "WICKETKEEPER" | "ALL_ROUNDER" | undefined;
    battingPosition?: "" | "OPENER" | "MIDDLE" | "LOWER" | undefined;
    bowlingStyle?: "" | "FAST" | "MEDIUM_FAST" | "SPINNER" | undefined;
    allRounderType?: "" | "ALL_ROUNDER" | "BATTING" | "BOWLING" | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
    footballDetailPosition?: "" | "GK" | "RB" | "CB" | "LB" | "DMF" | "CMF" | "AMF" | "LW" | "RW" | "ST" | undefined;
    photoUrl?: string | undefined;
}>, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    role?: string | undefined;
    cricketRole?: "" | "BATSMAN" | "BOWLER" | "WICKETKEEPER" | "ALL_ROUNDER" | undefined;
    battingPosition?: "" | "OPENER" | "MIDDLE" | "LOWER" | undefined;
    bowlingStyle?: "" | "FAST" | "MEDIUM_FAST" | "SPINNER" | undefined;
    allRounderType?: "" | "ALL_ROUNDER" | "BATTING" | "BOWLING" | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
    footballDetailPosition?: "" | "GK" | "RB" | "CB" | "LB" | "DMF" | "CMF" | "AMF" | "LW" | "RW" | "ST" | undefined;
    photoUrl?: string | undefined;
}, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    role?: string | undefined;
    cricketRole?: "" | "BATSMAN" | "BOWLER" | "WICKETKEEPER" | "ALL_ROUNDER" | undefined;
    battingPosition?: "" | "OPENER" | "MIDDLE" | "LOWER" | undefined;
    bowlingStyle?: "" | "FAST" | "MEDIUM_FAST" | "SPINNER" | undefined;
    allRounderType?: "" | "ALL_ROUNDER" | "BATTING" | "BOWLING" | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
    footballDetailPosition?: "" | "GK" | "RB" | "CB" | "LB" | "DMF" | "CMF" | "AMF" | "LW" | "RW" | "ST" | undefined;
    photoUrl?: string | undefined;
}>, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    role?: string | undefined;
    cricketRole?: "" | "BATSMAN" | "BOWLER" | "WICKETKEEPER" | "ALL_ROUNDER" | undefined;
    battingPosition?: "" | "OPENER" | "MIDDLE" | "LOWER" | undefined;
    bowlingStyle?: "" | "FAST" | "MEDIUM_FAST" | "SPINNER" | undefined;
    allRounderType?: "" | "ALL_ROUNDER" | "BATTING" | "BOWLING" | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
    footballDetailPosition?: "" | "GK" | "RB" | "CB" | "LB" | "DMF" | "CMF" | "AMF" | "LW" | "RW" | "ST" | undefined;
    photoUrl?: string | undefined;
}, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    role?: string | undefined;
    cricketRole?: "" | "BATSMAN" | "BOWLER" | "WICKETKEEPER" | "ALL_ROUNDER" | undefined;
    battingPosition?: "" | "OPENER" | "MIDDLE" | "LOWER" | undefined;
    bowlingStyle?: "" | "FAST" | "MEDIUM_FAST" | "SPINNER" | undefined;
    allRounderType?: "" | "ALL_ROUNDER" | "BATTING" | "BOWLING" | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
    footballDetailPosition?: "" | "GK" | "RB" | "CB" | "LB" | "DMF" | "CMF" | "AMF" | "LW" | "RW" | "ST" | undefined;
    photoUrl?: string | undefined;
}>;
export type UpdatePlayerInput = CreatePlayerInput;
export declare const banPlayerSchema: z.ZodObject<{
    banned: z.ZodBoolean;
    reason: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
}, "strip", z.ZodTypeAny, {
    banned: boolean;
    reason?: string | undefined;
}, {
    banned: boolean;
    reason?: string | undefined;
}>;
export type BanPlayerInput = z.infer<typeof banPlayerSchema>;
export interface Player {
    id: string;
    name: string;
    sport: Sport;
    role: string | null;
    nationality: string | null;
    dateOfBirth: string | null;
    photoUrl: string | null;
    externalRef: string | null;
    footballPosition: FootballPosition | null;
    footballDetailPosition: FootballDetailPosition | null;
    cricketRole: CricketRole | null;
    battingPosition: BattingPosition | null;
    bowlingStyle: BowlingStyle | null;
    allRounderType: AllRounderType | null;
    createdAt: string;
}
/** A player as seen within a specific league, carrying that league's ban status. */
export interface LeaguePlayer extends Player {
    banned: boolean;
    bannedReason: string | null;
}
