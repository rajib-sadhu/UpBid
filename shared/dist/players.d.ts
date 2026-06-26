import { z } from "zod";
import type { Sport, FootballPosition } from "./sports.js";
export declare const playerQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    sport: z.ZodOptional<z.ZodEnum<["CRICKET", "FOOTBALL", "BASKETBALL", "OTHER"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    q?: string | undefined;
    sport?: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER" | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    sport?: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER" | undefined;
}>;
export type PlayerQuery = z.infer<typeof playerQuerySchema>;
export declare const createPlayerSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    sport: z.ZodEnum<["CRICKET", "FOOTBALL", "BASKETBALL", "OTHER"]>;
    role: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    nationality: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    dateOfBirth: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    externalRef: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    footballPosition: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["GK", "DEF", "MID", "FWD"]>>, z.ZodLiteral<"">]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    role?: string | undefined;
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
}, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    role?: string | undefined;
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
}>, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    role?: string | undefined;
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
}, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    role?: string | undefined;
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
}>;
export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export declare const updatePlayerSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    sport: z.ZodEnum<["CRICKET", "FOOTBALL", "BASKETBALL", "OTHER"]>;
    role: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    nationality: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    dateOfBirth: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    externalRef: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    footballPosition: z.ZodUnion<[z.ZodOptional<z.ZodEnum<["GK", "DEF", "MID", "FWD"]>>, z.ZodLiteral<"">]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    role?: string | undefined;
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
}, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    role?: string | undefined;
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
}>, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    role?: string | undefined;
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
}, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
    role?: string | undefined;
    nationality?: string | undefined;
    dateOfBirth?: string | undefined;
    externalRef?: string | undefined;
    footballPosition?: "" | "GK" | "DEF" | "MID" | "FWD" | undefined;
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
    createdAt: string;
}
/** A player as seen within a specific league, carrying that league's ban status. */
export interface LeaguePlayer extends Player {
    banned: boolean;
    bannedReason: string | null;
}
