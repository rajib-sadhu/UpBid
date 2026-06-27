// Mirrors the Prisma `Sport` and `FootballPosition` enums (same string values) so the
// client never imports @prisma/client. Server maps these to Prisma enums at the DB edge.
export const SPORTS = ["CRICKET", "FOOTBALL", "BASKETBALL", "OTHER"] as const;
export type Sport = (typeof SPORTS)[number];

export const FOOTBALL_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type FootballPosition = (typeof FOOTBALL_POSITIONS)[number];

// Detailed football position, conditional on the broad bucket above. The broad
// bucket stays authoritative for lineup validation; this is descriptive detail.
export const FOOTBALL_DETAIL_POSITIONS = [
  "GK",
  "RB",
  "CB",
  "LB",
  "DMF",
  "CMF",
  "AMF",
  "LW",
  "RW",
  "ST",
] as const;
export type FootballDetailPosition = (typeof FOOTBALL_DETAIL_POSITIONS)[number];

/** Which detailed positions belong to each broad bucket. */
export const FOOTBALL_DETAIL_BY_BUCKET: Record<FootballPosition, readonly FootballDetailPosition[]> =
  {
    GK: ["GK"],
    DEF: ["RB", "CB", "LB"],
    MID: ["DMF", "CMF", "AMF"],
    FWD: ["LW", "RW", "ST"],
  };
