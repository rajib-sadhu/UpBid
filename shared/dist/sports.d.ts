export declare const SPORTS: readonly ["CRICKET", "FOOTBALL", "BASKETBALL", "OTHER"];
export type Sport = (typeof SPORTS)[number];
export declare const FOOTBALL_POSITIONS: readonly ["GK", "DEF", "MID", "FWD"];
export type FootballPosition = (typeof FOOTBALL_POSITIONS)[number];
export declare const FOOTBALL_DETAIL_POSITIONS: readonly ["GK", "RB", "CB", "LB", "DMF", "CMF", "AMF", "LW", "RW", "ST"];
export type FootballDetailPosition = (typeof FOOTBALL_DETAIL_POSITIONS)[number];
/** Which detailed positions belong to each broad bucket. */
export declare const FOOTBALL_DETAIL_BY_BUCKET: Record<FootballPosition, readonly FootballDetailPosition[]>;
