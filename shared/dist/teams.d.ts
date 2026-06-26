import { z } from "zod";
export declare const createTeamSchema: z.ZodObject<{
    ownerUserId: z.ZodString;
    name: z.ZodString;
    shortName: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    ownerUserId: string;
    shortName?: string | undefined;
}, {
    name: string;
    ownerUserId: string;
    shortName?: string | undefined;
}>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export declare const updateTeamSchema: z.ZodObject<{
    name: z.ZodString;
    shortName: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    shortName?: string | undefined;
}, {
    name: string;
    shortName?: string | undefined;
}>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export interface Team {
    id: string;
    auctionId: string;
    ownerUserId: string;
    ownerName: string;
    ownerEmail: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    committedAmount: string;
    playerCount: number;
    createdAt: string;
}
