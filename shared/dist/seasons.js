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
    .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, { message: "End date must be on or after start date", path: ["endDate"] });
export const updateSeasonSchema = createSeasonSchema;
// ---- Participating franchises (which league franchises play this season) ----
export const setSeasonFranchisesSchema = z.object({
    franchiseIds: z.array(z.string().min(1)).max(64),
});
