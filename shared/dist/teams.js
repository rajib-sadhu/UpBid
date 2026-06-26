import { z } from "zod";
export const createTeamSchema = z.object({
    ownerUserId: z.string().min(1, "Pick a franchise owner"),
    name: z.string().trim().min(1, "Name is required").max(120),
    shortName: z.string().trim().max(12).optional().or(z.literal("")),
});
export const updateTeamSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(120),
    shortName: z.string().trim().max(12).optional().or(z.literal("")),
});
