import { z } from "zod";
import { SPORTS } from "./sports.js";
import type { Sport } from "./sports.js";
import { shortNameSchema } from "./common.js";

export const createLeagueSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  shortName: shortNameSchema,
  sport: z.enum(SPORTS),
});
export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;

// Name + short name update: a league's sport is fixed once players can be banned under it.
export const updateLeagueSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  shortName: shortNameSchema,
});
export type UpdateLeagueInput = z.infer<typeof updateLeagueSchema>;

export interface League {
  id: string;
  name: string;
  shortName: string;
  sport: Sport;
  organizerId: string;
  seasonCount?: number;
  createdAt: string;
}
