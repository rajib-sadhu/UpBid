import { z } from "zod";
import { positiveMoneyString } from "./money.js";

// ---- Pre-auction retention (organizer-only, DRAFT-only) --------------------
// Teams keep players from an organizer-picked COMPLETED auction of the same
// league. Price defaults to what the player cost there and is editable.

export const retentionSourceSchema = z.object({
  sourceAuctionId: z.string().min(1).nullable(),
});
export type RetentionSourceInput = z.infer<typeof retentionSourceSchema>;

export const franchiseRetentionsSchema = z.object({
  items: z
    .array(
      z.object({
        playerId: z.string().min(1),
        price: positiveMoneyString,
      }),
    )
    .max(100),
});
export type FranchiseRetentionsInput = z.infer<typeof franchiseRetentionsSchema>;

// ---- Read model for the setup card -----------------------------------------

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
