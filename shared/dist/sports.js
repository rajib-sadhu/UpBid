// Mirrors the Prisma `Sport` and `FootballPosition` enums (same string values) so the
// client never imports @prisma/client. Server maps these to Prisma enums at the DB edge.
export const SPORTS = ["CRICKET", "FOOTBALL", "BASKETBALL", "OTHER"];
export const FOOTBALL_POSITIONS = ["GK", "DEF", "MID", "FWD"];
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
];
/** Which detailed positions belong to each broad bucket. */
export const FOOTBALL_DETAIL_BY_BUCKET = {
    GK: ["GK"],
    DEF: ["RB", "CB", "LB"],
    MID: ["DMF", "CMF", "AMF"],
    FWD: ["LW", "RW", "ST"],
};
