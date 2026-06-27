import { z } from "zod";
import type { Sport, FootballPosition } from "./sports.js";
import type { LotStatus, AuctionRound } from "./auctions.js";
export declare const addLotsSchema: z.ZodObject<{
    lots: z.ZodArray<z.ZodObject<{
        playerId: z.ZodString;
        basePrice: z.ZodEffects<z.ZodString, string, string>;
        isOverseas: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        playerId: string;
        basePrice: string;
        isOverseas: boolean;
    }, {
        playerId: string;
        basePrice: string;
        isOverseas?: boolean | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    lots: {
        playerId: string;
        basePrice: string;
        isOverseas: boolean;
    }[];
}, {
    lots: {
        playerId: string;
        basePrice: string;
        isOverseas?: boolean | undefined;
    }[];
}>;
export type AddLotsInput = z.infer<typeof addLotsSchema>;
export declare const updateLotSchema: z.ZodObject<{
    basePrice: z.ZodEffects<z.ZodString, string, string>;
    isOverseas: z.ZodBoolean;
    lotOrder: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    basePrice: string;
    isOverseas: boolean;
    lotOrder?: number | undefined;
}, {
    basePrice: string;
    isOverseas: boolean;
    lotOrder?: number | undefined;
}>;
export type UpdateLotInput = z.infer<typeof updateLotSchema>;
export declare const allowedFormationsSchema: z.ZodObject<{
    formationIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    formationIds: string[];
}, {
    formationIds: string[];
}>;
export type AllowedFormationsInput = z.infer<typeof allowedFormationsSchema>;
export interface Lot {
    id: string;
    auctionId: string;
    playerId: string;
    playerName: string;
    sport: Sport;
    footballPosition: FootballPosition | null;
    basePrice: string;
    isOverseas: boolean;
    status: LotStatus;
    round: AuctionRound;
    lotOrder: number | null;
    createdAt: string;
}
export interface Formation {
    id: string;
    name: string;
    numGK: number;
    numDef: number;
    numMid: number;
    numFwd: number;
}
