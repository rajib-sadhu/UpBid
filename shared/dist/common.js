import { z } from "zod";
// Reusable field validators shared across resources.
/**
 * A 3-letter short code (e.g. league "BAL", team "RCB"). Exactly three letters,
 * auto-uppercased on parse so "rcb" and "RCB" are the same value. Used for both
 * leagues (unique per organizer) and teams (unique per auction).
 */
export const shortNameSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Short name must be exactly 3 letters");
/** A #RRGGBB hex color (e.g. a franchise theme color), normalized to uppercase. */
export const hexColorSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^#[0-9A-F]{6}$/, "Use a #RRGGBB hex color");
