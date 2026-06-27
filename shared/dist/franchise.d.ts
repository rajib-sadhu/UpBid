import { z } from "zod";
export declare const createFranchiseSchema: z.ZodObject<{
    name: z.ZodString;
    shortName: z.ZodString;
    primaryColor: z.ZodString;
    secondaryColor: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    ownerUserId: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    shortName: string;
    primaryColor: string;
    secondaryColor?: string | undefined;
    ownerUserId?: string | undefined;
}, {
    name: string;
    shortName: string;
    primaryColor: string;
    secondaryColor?: string | undefined;
    ownerUserId?: string | undefined;
}>;
export type CreateFranchiseInput = z.infer<typeof createFranchiseSchema>;
export declare const updateFranchiseSchema: z.ZodObject<{
    name: z.ZodString;
    shortName: z.ZodString;
    primaryColor: z.ZodString;
    secondaryColor: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    ownerUserId: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    shortName: string;
    primaryColor: string;
    secondaryColor?: string | undefined;
    ownerUserId?: string | undefined;
}, {
    name: string;
    shortName: string;
    primaryColor: string;
    secondaryColor?: string | undefined;
    ownerUserId?: string | undefined;
}>;
export type UpdateFranchiseInput = CreateFranchiseInput;
export interface Franchise {
    id: string;
    leagueId: string;
    name: string;
    shortName: string;
    primaryColor: string;
    secondaryColor: string | null;
    logoUrl: string | null;
    ownerUserId: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
    createdAt: string;
}
