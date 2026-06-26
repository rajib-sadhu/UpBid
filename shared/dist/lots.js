import { z } from "zod";
import { moneyString } from "./money.js";
// Add one or more players to the lot list with a base price.
export const addLotsSchema = z.object({
    lots: z
        .array(z.object({
        playerId: z.string().min(1),
        basePrice: moneyString,
        isOverseas: z.coerce.boolean().default(false),
    }))
        .min(1, "Select at least one player")
        .max(500),
});
export const updateLotSchema = z.object({
    basePrice: moneyString,
    isOverseas: z.coerce.boolean(),
    lotOrder: z.coerce.number().int().min(0).optional(),
});
export const allowedFormationsSchema = z.object({
    formationIds: z.array(z.string().min(1)).max(50),
});
