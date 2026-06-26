import { z } from "zod";
import type { Sport } from "./sports.js";
export declare const createLeagueSchema: z.ZodObject<{
    name: z.ZodString;
    sport: z.ZodEnum<["CRICKET", "FOOTBALL", "BASKETBALL", "OTHER"]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
}, {
    name: string;
    sport: "CRICKET" | "FOOTBALL" | "BASKETBALL" | "OTHER";
}>;
export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;
export declare const updateLeagueSchema: z.ZodObject<{
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export type UpdateLeagueInput = z.infer<typeof updateLeagueSchema>;
export interface League {
    id: string;
    name: string;
    sport: Sport;
    organizerId: string;
    seasonCount?: number;
    createdAt: string;
}
