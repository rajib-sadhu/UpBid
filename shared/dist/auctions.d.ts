import { z } from "zod";
export declare const AUCTION_STATUSES: readonly ["DRAFT", "LIVE", "PAUSED", "RE_AUCTION", "ASSIGNMENT", "COMPLETED"];
export type AuctionStatus = (typeof AUCTION_STATUSES)[number];
export declare const BIDDING_MODES: readonly ["ORGANIZER", "FRANCHISE"];
export type BiddingMode = (typeof BIDDING_MODES)[number];
export declare const AUCTION_ROUNDS: readonly ["MAIN", "RE_AUCTION", "ASSIGNMENT"];
export type AuctionRound = (typeof AUCTION_ROUNDS)[number];
export declare const LOT_STATUSES: readonly ["PENDING", "ON_BLOCK", "SOLD", "UNSOLD", "ASSIGNED"];
export type LotStatus = (typeof LOT_STATUSES)[number];
export declare const createAuctionSchema: z.ZodObject<{
    name: z.ZodString;
    biddingMode: z.ZodDefault<z.ZodEnum<["ORGANIZER", "FRANCHISE"]>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    biddingMode: "ORGANIZER" | "FRANCHISE";
}, {
    name: string;
    biddingMode?: "ORGANIZER" | "FRANCHISE" | undefined;
}>;
export type CreateAuctionInput = z.infer<typeof createAuctionSchema>;
export declare const updateAuctionSchema: z.ZodObject<{
    name: z.ZodString;
    biddingMode: z.ZodEnum<["ORGANIZER", "FRANCHISE"]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    biddingMode: "ORGANIZER" | "FRANCHISE";
}, {
    name: string;
    biddingMode: "ORGANIZER" | "FRANCHISE";
}>;
export type UpdateAuctionInput = z.infer<typeof updateAuctionSchema>;
export declare const auctionRulesSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    creditPerTeam: z.ZodEffects<z.ZodString, string, string>;
    minPlayersPerTeam: z.ZodNumber;
    maxPlayersPerTeam: z.ZodNumber;
    minTeams: z.ZodNumber;
    maxTeams: z.ZodNumber;
    unsoldPrice: z.ZodString;
    defaultLotDurationSec: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    creditPerTeam: string;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
    minTeams: number;
    maxTeams: number;
    unsoldPrice: string;
    defaultLotDurationSec: number;
}, {
    creditPerTeam: string;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
    minTeams: number;
    maxTeams: number;
    unsoldPrice: string;
    defaultLotDurationSec?: number | undefined;
}>, {
    creditPerTeam: string;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
    minTeams: number;
    maxTeams: number;
    unsoldPrice: string;
    defaultLotDurationSec: number;
}, {
    creditPerTeam: string;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
    minTeams: number;
    maxTeams: number;
    unsoldPrice: string;
    defaultLotDurationSec?: number | undefined;
}>, {
    creditPerTeam: string;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
    minTeams: number;
    maxTeams: number;
    unsoldPrice: string;
    defaultLotDurationSec: number;
}, {
    creditPerTeam: string;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
    minTeams: number;
    maxTeams: number;
    unsoldPrice: string;
    defaultLotDurationSec?: number | undefined;
}>;
export type AuctionRulesInput = z.infer<typeof auctionRulesSchema>;
export declare const incrementTierSchema: z.ZodObject<{
    fromAmount: z.ZodString;
    increment: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    fromAmount: string;
    increment: string;
}, {
    fromAmount: string;
    increment: string;
}>;
export declare const incrementTiersSchema: z.ZodObject<{
    tiers: z.ZodEffects<z.ZodArray<z.ZodObject<{
        fromAmount: z.ZodString;
        increment: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        fromAmount: string;
        increment: string;
    }, {
        fromAmount: string;
        increment: string;
    }>, "many">, {
        fromAmount: string;
        increment: string;
    }[], {
        fromAmount: string;
        increment: string;
    }[]>;
}, "strip", z.ZodTypeAny, {
    tiers: {
        fromAmount: string;
        increment: string;
    }[];
}, {
    tiers: {
        fromAmount: string;
        increment: string;
    }[];
}>;
export type IncrementTiersInput = z.infer<typeof incrementTiersSchema>;
export declare const lineupRulesSchema: z.ZodEffects<z.ZodObject<{
    startingSize: z.ZodDefault<z.ZodNumber>;
    overseasCapEnabled: z.ZodDefault<z.ZodBoolean>;
    maxOverseasInXI: z.ZodOptional<z.ZodNumber>;
    requireWicketkeeper: z.ZodDefault<z.ZodBoolean>;
    requireCaptain: z.ZodDefault<z.ZodBoolean>;
    requireViceCaptain: z.ZodDefault<z.ZodBoolean>;
    requireFirstBowler: z.ZodDefault<z.ZodBoolean>;
    requireSecondBowler: z.ZodDefault<z.ZodBoolean>;
    requireFullBattingOrder: z.ZodDefault<z.ZodBoolean>;
    benchSize: z.ZodOptional<z.ZodNumber>;
    editableAfterLockByOwner: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    startingSize: number;
    overseasCapEnabled: boolean;
    requireWicketkeeper: boolean;
    requireCaptain: boolean;
    requireViceCaptain: boolean;
    requireFirstBowler: boolean;
    requireSecondBowler: boolean;
    requireFullBattingOrder: boolean;
    editableAfterLockByOwner: boolean;
    maxOverseasInXI?: number | undefined;
    benchSize?: number | undefined;
}, {
    startingSize?: number | undefined;
    overseasCapEnabled?: boolean | undefined;
    maxOverseasInXI?: number | undefined;
    requireWicketkeeper?: boolean | undefined;
    requireCaptain?: boolean | undefined;
    requireViceCaptain?: boolean | undefined;
    requireFirstBowler?: boolean | undefined;
    requireSecondBowler?: boolean | undefined;
    requireFullBattingOrder?: boolean | undefined;
    benchSize?: number | undefined;
    editableAfterLockByOwner?: boolean | undefined;
}>, {
    startingSize: number;
    overseasCapEnabled: boolean;
    requireWicketkeeper: boolean;
    requireCaptain: boolean;
    requireViceCaptain: boolean;
    requireFirstBowler: boolean;
    requireSecondBowler: boolean;
    requireFullBattingOrder: boolean;
    editableAfterLockByOwner: boolean;
    maxOverseasInXI?: number | undefined;
    benchSize?: number | undefined;
}, {
    startingSize?: number | undefined;
    overseasCapEnabled?: boolean | undefined;
    maxOverseasInXI?: number | undefined;
    requireWicketkeeper?: boolean | undefined;
    requireCaptain?: boolean | undefined;
    requireViceCaptain?: boolean | undefined;
    requireFirstBowler?: boolean | undefined;
    requireSecondBowler?: boolean | undefined;
    requireFullBattingOrder?: boolean | undefined;
    benchSize?: number | undefined;
    editableAfterLockByOwner?: boolean | undefined;
}>;
export type LineupRulesInput = z.infer<typeof lineupRulesSchema>;
export interface AuctionRulesDTO {
    creditPerTeam: string;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
    minTeams: number;
    maxTeams: number;
    unsoldPrice: string;
    defaultLotDurationSec: number;
}
export interface IncrementTierDTO {
    id: string;
    fromAmount: string;
    increment: string;
}
export interface LineupRulesDTO {
    startingSize: number;
    overseasCapEnabled: boolean;
    maxOverseasInXI: number | null;
    requireWicketkeeper: boolean;
    requireCaptain: boolean;
    requireViceCaptain: boolean;
    requireFirstBowler: boolean;
    requireSecondBowler: boolean;
    requireFullBattingOrder: boolean;
    benchSize: number | null;
    editableAfterLockByOwner: boolean;
}
export interface Auction {
    id: string;
    name: string;
    seasonId: string;
    status: AuctionStatus;
    biddingMode: BiddingMode;
    round: AuctionRound;
    createdAt: string;
    teamCount?: number;
    lotCount?: number;
}
/** Full auction config for the DRAFT setup screen. */
export interface AuctionDetail extends Auction {
    sport: import("./sports.js").Sport;
    leagueId: string;
    rules: AuctionRulesDTO | null;
    lineupRules: LineupRulesDTO | null;
    incrementTiers: IncrementTierDTO[];
    allowedFormationIds: string[];
}
