import { z } from "zod";
import { SPORTS } from "./sports.js";
import { shortNameSchema } from "./common.js";
export const createLeagueSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(120),
    shortName: shortNameSchema,
    sport: z.enum(SPORTS),
});
// Name + short name update: a league's sport is fixed once players can be banned under it.
export const updateLeagueSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(120),
    shortName: shortNameSchema,
});
