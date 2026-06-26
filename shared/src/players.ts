import { z } from "zod";
import { SPORTS, FOOTBALL_POSITIONS } from "./sports.js";
import type { Sport, FootballPosition } from "./sports.js";
import { listQuerySchema } from "./pagination.js";

// List query for the global player pool: pagination + search + optional sport filter.
export const playerQuerySchema = listQuerySchema.extend({
  sport: z.enum(SPORTS).optional(),
});
export type PlayerQuery = z.infer<typeof playerQuerySchema>;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .or(z.literal(""));

const optionalText = z.string().trim().max(120).optional().or(z.literal(""));

export const createPlayerSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    sport: z.enum(SPORTS),
    role: optionalText,
    nationality: optionalText,
    dateOfBirth: dateString,
    externalRef: optionalText,
    // Structured position for football lineup validation; ignored for other sports.
    footballPosition: z.enum(FOOTBALL_POSITIONS).optional().or(z.literal("")),
  })
  .refine((v) => !(v.footballPosition && v.sport !== "FOOTBALL"), {
    message: "Football position only applies to football players",
    path: ["footballPosition"],
  });
export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;

// Full replace on update (same fields, sport included).
export const updatePlayerSchema = createPlayerSchema;
export type UpdatePlayerInput = CreatePlayerInput;

export const banPlayerSchema = z.object({
  banned: z.boolean(),
  reason: z.string().trim().max(240).optional().or(z.literal("")),
});
export type BanPlayerInput = z.infer<typeof banPlayerSchema>;

export interface Player {
  id: string;
  name: string;
  sport: Sport;
  role: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  photoUrl: string | null;
  externalRef: string | null;
  footballPosition: FootballPosition | null;
  createdAt: string;
}

/** A player as seen within a specific league, carrying that league's ban status. */
export interface LeaguePlayer extends Player {
  banned: boolean;
  bannedReason: string | null;
}
