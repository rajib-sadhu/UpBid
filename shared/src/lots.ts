import { z } from "zod";
import { moneyString } from "./money.js";
import type { Sport, FootballPosition } from "./sports.js";
import type { LotStatus, AuctionRound } from "./auctions.js";

// Add one or more players to the lot list with a base price.
export const addLotsSchema = z.object({
  lots: z
    .array(
      z.object({
        playerId: z.string().min(1),
        basePrice: moneyString,
        isOverseas: z.coerce.boolean().default(false),
      }),
    )
    .min(1, "Select at least one player")
    .max(500),
});
export type AddLotsInput = z.infer<typeof addLotsSchema>;

export const updateLotSchema = z.object({
  basePrice: moneyString,
  isOverseas: z.coerce.boolean(),
  lotOrder: z.coerce.number().int().min(0).optional(),
});
export type UpdateLotInput = z.infer<typeof updateLotSchema>;

export const allowedFormationsSchema = z.object({
  formationIds: z.array(z.string().min(1)).max(50),
});
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
