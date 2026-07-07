import { z } from "zod";
import { positiveMoneyString } from "./money.js";
// ---- Pre-auction retention (organizer-only, DRAFT-only) --------------------
// Teams keep players from an organizer-picked COMPLETED auction of the same
// league. Price defaults to what the player cost there and is editable.
export const retentionSourceSchema = z.object({
    sourceAuctionId: z.string().min(1).nullable(),
});
export const franchiseRetentionsSchema = z.object({
    items: z
        .array(z.object({
        playerId: z.string().min(1),
        price: positiveMoneyString,
    }))
        .max(100),
});
