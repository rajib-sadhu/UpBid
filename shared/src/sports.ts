// Mirrors the Prisma `Sport` and `FootballPosition` enums (same string values) so the
// client never imports @prisma/client. Server maps these to Prisma enums at the DB edge.
export const SPORTS = ["CRICKET", "FOOTBALL", "BASKETBALL", "OTHER"] as const;
export type Sport = (typeof SPORTS)[number];

export const FOOTBALL_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type FootballPosition = (typeof FOOTBALL_POSITIONS)[number];
