import { z } from "zod";

// Dates travel the wire as "YYYY-MM-DD" strings (or omitted). The server converts
// them to DateTime; the client uses <input type="date">.
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .or(z.literal(""));

export const createSeasonSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    startDate: dateString,
    endDate: dateString,
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.startDate <= v.endDate,
    { message: "End date must be on or after start date", path: ["endDate"] },
  );
export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;

export const updateSeasonSchema = createSeasonSchema;
export type UpdateSeasonInput = CreateSeasonInput;

export interface Season {
  id: string;
  name: string;
  leagueId: string;
  startDate: string | null;
  endDate: string | null;
  auctionCount?: number;
  createdAt: string;
}

// ---- Participating franchises (which league franchises play this season) ----

export const setSeasonFranchisesSchema = z.object({
  franchiseIds: z.array(z.string().min(1)).max(64),
});
export type SetSeasonFranchisesInput = z.infer<typeof setSeasonFranchisesSchema>;

/** A league franchise as shown on the season's selection screen. */
export interface SeasonFranchiseOption {
  franchiseId: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string | null;
  logoUrl: string | null;
  ownerName: string | null;
  selected: boolean;
}

export interface SeasonFranchisesData {
  seasonId: string;
  /** True once an auction in this season has left DRAFT — selection is frozen. */
  locked: boolean;
  franchises: SeasonFranchiseOption[];
}
