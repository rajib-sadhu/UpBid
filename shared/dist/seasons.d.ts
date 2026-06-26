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
