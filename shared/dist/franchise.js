import { z } from "zod";
import { shortNameSchema, hexColorSchema } from "./common.js";
// A Franchise is a LEAGUE-level team identity (name, 3-letter code, primary +
// optional secondary color, logo, optional owner). Seasons select which
// franchises participate; each auction then materializes a Team (per-auction
// tallies) per selected franchise.
export const createFranchiseSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(120),
    shortName: shortNameSchema,
    primaryColor: hexColorSchema,
    // Optional second color. "" / omitted → no secondary (display falls back to primary).
    secondaryColor: hexColorSchema.optional().or(z.literal("")),
    // Optional owner — a FRANCHISE-role user. "" / omitted → no owner yet.
    ownerUserId: z.string().trim().optional().or(z.literal("")),
});
export const updateFranchiseSchema = createFranchiseSchema;
