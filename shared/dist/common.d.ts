import { z } from "zod";
/**
 * A 3-letter short code (e.g. league "BAL", team "RCB"). Exactly three letters,
 * auto-uppercased on parse so "rcb" and "RCB" are the same value. Used for both
 * leagues (unique per organizer) and teams (unique per auction).
 */
export declare const shortNameSchema: z.ZodString;
/** A #RRGGBB hex color (e.g. a franchise theme color), normalized to uppercase. */
export declare const hexColorSchema: z.ZodString;
