import { z } from "zod";
export declare const createSeasonSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    startDate: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    endDate: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    startDate?: string | undefined;
    endDate?: string | undefined;
}, {
    name: string;
    startDate?: string | undefined;
    endDate?: string | undefined;
}>, {
    name: string;
    startDate?: string | undefined;
    endDate?: string | undefined;
}, {
    name: string;
    startDate?: string | undefined;
    endDate?: string | undefined;
}>;
export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;
export declare const updateSeasonSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    startDate: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    endDate: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    startDate?: string | undefined;
    endDate?: string | undefined;
}, {
    name: string;
    startDate?: string | undefined;
    endDate?: string | undefined;
}>, {
    name: string;
    startDate?: string | undefined;
    endDate?: string | undefined;
}, {
    name: string;
    startDate?: string | undefined;
    endDate?: string | undefined;
}>;
export type UpdateSeasonInput = CreateSeasonInput;
export interface Season {
    id: string;
    name: string;
    leagueId: string;
    startDate: string | null;
    endDate: string | null;
    auctionCount?: number;
    createdAt: string;
}
export declare const setSeasonFranchisesSchema: z.ZodObject<{
    franchiseIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    franchiseIds: string[];
}, {
    franchiseIds: string[];
}>;
export type SetSeasonFranchisesInput = z.infer<typeof setSeasonFranchisesSchema>;
/** A league franchise as shown on the season's selection screen. */
export interface SeasonFranchiseOption {
    franchiseId: string;
    name: string;
    shortName: string;
    primaryColor: string;
    secondaryColor: string | null;
    logoUrl: string | null;
    ownerName: string | null;
    selected: boolean;
}
export interface SeasonFranchisesData {
    seasonId: string;
    /** True once an auction in this season has left DRAFT — selection is frozen. */
    locked: boolean;
    franchises: SeasonFranchiseOption[];
}
