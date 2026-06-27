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
export type CreateFranchiseInput = z.infer<typeof createFranchiseSchema>;

export const updateFranchiseSchema = createFranchiseSchema;
export type UpdateFranchiseInput = CreateFranchiseInput;

export interface Franchise {
  id: string;
  leagueId: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string | null;
  logoUrl: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
}
