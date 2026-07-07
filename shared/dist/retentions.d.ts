import { z } from "zod";
export declare const retentionSourceSchema: z.ZodObject<{
    sourceAuctionId: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    sourceAuctionId: string | null;
}, {
    sourceAuctionId: string | null;
}>;
export type RetentionSourceInput = z.infer<typeof retentionSourceSchema>;
export declare const franchiseRetentionsSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        playerId: z.ZodString;
        price: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    }, "strip", z.ZodTypeAny, {
        playerId: string;
        price: string;
    }, {
        playerId: string;
        price: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    items: {
        playerId: string;
        price: string;
    }[];
}, {
    items: {
        playerId: string;
        price: string;
    }[];
}>;
export type FranchiseRetentionsInput = z.infer<typeof franchiseRetentionsSchema>;
/** One player of a franchise's previous-season squad, with retention state. */
export interface RetainablePlayer {
    playerId: string;
    name: string;
    role: string | null;
    photoUrl: string | null;
    isOverseas: boolean;
    /** What the player cost in the source auction (default retention price). */
    prevPrice: string;
    /** Banned in this league — not retainable. */
    banned: boolean;
    /** Already added to this auction's lot list — not retainable. */
    inLotList: boolean;
    /** Current retention price if retained, else null. */
    retainedPrice: string | null;
}
export interface RetentionFranchise {
    franchiseId: string;
    name: string;
    shortName: string;
    primaryColor: string;
    squad: RetainablePlayer[];
    /** Sum of this franchise's current retention prices ("0" when none). */
    retainedTotal: string;
}
export interface RetentionSourceOption {
    id: string;
    name: string;
    seasonName: string;
}
export interface RetentionConfig {
    /** 0 = retention disabled for this auction. */
    maxRetentionsPerTeam: number;
    sourceAuctionId: string | null;
    /** COMPLETED auctions of this league the organizer may retain from. */
    sourceOptions: RetentionSourceOption[];
    /** Season-selected franchises with their source-auction squads. */
    franchises: RetentionFranchise[];
}
