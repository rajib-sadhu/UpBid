import { z } from "zod";
import { SPORTS } from "./sports.js";
import type { Sport } from "./sports.js";

export const createLeagueSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  sport: z.enum(SPORTS),
});
export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;

// Name-only update: a league's sport is fixed once players can be banned under it.
export const updateLeagueSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
});
export type UpdateLeagueInput = z.infer<typeof updateLeagueSchema>;

export interface League {
  id: string;
  name: string;
  sport: Sport;
  organizerId: string;
  seasonCount?: number;
  createdAt: string;
}
