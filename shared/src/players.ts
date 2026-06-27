import { z } from "zod";
import { SPORTS, FOOTBALL_POSITIONS, FOOTBALL_DETAIL_POSITIONS, FOOTBALL_DETAIL_BY_BUCKET } from "./sports.js";
import type { Sport, FootballPosition, FootballDetailPosition } from "./sports.js";
import { listQuerySchema } from "./pagination.js";

// ---- Cricket attribute enums ----------------------------------------------
// Structured cricket player data. The playing role is chosen first; the other
// fields are conditional on it (see createPlayerSchema below):
//   - batting position: all roles
//   - bowling style:    BOWLER, ALL_ROUNDER
//   - all-rounder type: ALL_ROUNDER only

export const CRICKET_ROLES = ["BATSMAN", "BOWLER", "WICKETKEEPER", "ALL_ROUNDER"] as const;
export type CricketRole = (typeof CRICKET_ROLES)[number];

export const BATTING_POSITIONS = ["OPENER", "MIDDLE", "LOWER"] as const;
export type BattingPosition = (typeof BATTING_POSITIONS)[number];

export const BOWLING_STYLES = ["FAST", "MEDIUM_FAST", "SPINNER"] as const;
export type BowlingStyle = (typeof BOWLING_STYLES)[number];

export const ALL_ROUNDER_TYPES = ["ALL_ROUNDER", "BATTING", "BOWLING"] as const;
export type AllRounderType = (typeof ALL_ROUNDER_TYPES)[number];

/** Human-readable labels for display + form option text. */
export const CRICKET_ROLE_LABELS: Record<CricketRole, string> = {
  BATSMAN: "Batsman",
  BOWLER: "Bowler",
  WICKETKEEPER: "Wicketkeeper",
  ALL_ROUNDER: "All Rounder",
};
export const BATTING_POSITION_LABELS: Record<BattingPosition, string> = {
  OPENER: "Opener",
  MIDDLE: "Middle",
  LOWER: "Lower",
};
export const BOWLING_STYLE_LABELS: Record<BowlingStyle, string> = {
  FAST: "Fast",
  MEDIUM_FAST: "Medium Fast",
  SPINNER: "Spinner",
};
export const ALL_ROUNDER_TYPE_LABELS: Record<AllRounderType, string> = {
  ALL_ROUNDER: "All-rounder",
  BATTING: "Batting all-rounder",
  BOWLING: "Bowling all-rounder",
};

/** Does a cricket playing role need a bowling style? */
export function roleNeedsBowlingStyle(role: CricketRole): boolean {
  return role === "BOWLER" || role === "ALL_ROUNDER";
}

// Columns the players table can be sorted by (server-side, across all pages).
export const PLAYER_SORT_FIELDS = [
  "name",
  "sport",
  "nationality",
  "dateOfBirth",
  "externalRef",
  "createdAt",
  "role",
  "cricketRole",
  "battingPosition",
  "bowlingStyle",
  "allRounderType",
  "footballPosition",
  "footballDetailPosition",
] as const;
export type PlayerSortField = (typeof PLAYER_SORT_FIELDS)[number];

// List query for the global player pool: pagination + search + optional sport
// filter + sort. Defaults to newest-added first.
export const playerQuerySchema = listQuerySchema.extend({
  sport: z.enum(SPORTS).optional(),
  sort: z.enum(PLAYER_SORT_FIELDS).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});
export type PlayerQuery = z.infer<typeof playerQuerySchema>;

// Per-league availability list: sort by name or per-league ban status.
export const LEAGUE_PLAYER_SORT_FIELDS = ["name", "banned"] as const;
export type LeaguePlayerSortField = (typeof LEAGUE_PLAYER_SORT_FIELDS)[number];

export const leaguePlayerQuerySchema = listQuerySchema.extend({
  sort: z.enum(LEAGUE_PLAYER_SORT_FIELDS).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type LeaguePlayerQuery = z.infer<typeof leaguePlayerQuerySchema>;

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
    // Optional photo: organizers may upload a file (handled outside Zod, as
    // multipart) OR paste an external image URL here. Must be http(s) when given.
    photoUrl: z
      .string()
      .trim()
      .url("Enter a valid image URL")
      .refine((u) => /^https?:\/\//i.test(u), "Image URL must start with http:// or https://")
      .optional()
      .or(z.literal("")),
    // Broad position (lineup-critical) + detailed position, conditional on it.
    // Ignored for non-football sports.
    footballPosition: z.enum(FOOTBALL_POSITIONS).optional().or(z.literal("")),
    footballDetailPosition: z.enum(FOOTBALL_DETAIL_POSITIONS).optional().or(z.literal("")),
    // Structured cricket attributes; ignored for other sports. Conditional rules
    // are enforced in superRefine below.
    cricketRole: z.enum(CRICKET_ROLES).optional().or(z.literal("")),
    battingPosition: z.enum(BATTING_POSITIONS).optional().or(z.literal("")),
    bowlingStyle: z.enum(BOWLING_STYLES).optional().or(z.literal("")),
    allRounderType: z.enum(ALL_ROUNDER_TYPES).optional().or(z.literal("")),
  })
  .refine((v) => !(v.footballPosition && v.sport !== "FOOTBALL"), {
    message: "Football position only applies to football players",
    path: ["footballPosition"],
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });

    // ---- Cricket ----
    if (v.sport === "CRICKET") {
      if (!v.cricketRole) {
        issue("cricketRole", "Playing role is required");
      } else {
        // Batting position applies to every cricket role.
        if (!v.battingPosition) issue("battingPosition", "Batting position is required");
        // Bowling style only for bowlers and all-rounders.
        if (roleNeedsBowlingStyle(v.cricketRole) && !v.bowlingStyle) {
          issue("bowlingStyle", "Bowling style is required");
        }
        // All-rounder type only for all-rounders.
        if (v.cricketRole === "ALL_ROUNDER" && !v.allRounderType) {
          issue("allRounderType", "All-rounder type is required");
        }
      }
    } else {
      // Cricket fields must not be set on non-cricket players.
      for (const f of ["cricketRole", "battingPosition", "bowlingStyle", "allRounderType"] as const) {
        if (v[f]) issue(f, "Cricket fields only apply to cricket players");
      }
    }

    // ---- Football ----
    if (v.sport === "FOOTBALL") {
      if (!v.footballPosition) {
        issue("footballPosition", "Position is required");
      } else if (!v.footballDetailPosition) {
        issue("footballDetailPosition", "Detailed position is required");
      } else if (!FOOTBALL_DETAIL_BY_BUCKET[v.footballPosition].includes(v.footballDetailPosition)) {
        issue("footballDetailPosition", "Detailed position doesn't match the selected position");
      }
    } else if (v.footballDetailPosition) {
      issue("footballDetailPosition", "Football position only applies to football players");
    }
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
  footballDetailPosition: FootballDetailPosition | null;
  cricketRole: CricketRole | null;
  battingPosition: BattingPosition | null;
  bowlingStyle: BowlingStyle | null;
  allRounderType: AllRounderType | null;
  createdAt: string;
}

/** A player as seen within a specific league, carrying that league's ban status. */
export interface LeaguePlayer extends Player {
  banned: boolean;
  bannedReason: string | null;
}
