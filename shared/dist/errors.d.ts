export declare const ERROR_CODES: {
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
    readonly UNAUTHENTICATED: "UNAUTHENTICATED";
    readonly INVALID_CREDENTIALS: "INVALID_CREDENTIALS";
    readonly FORBIDDEN: "FORBIDDEN";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly EMAIL_TAKEN: "EMAIL_TAKEN";
    readonly CONFLICT: "CONFLICT";
    readonly SPORT_MISMATCH: "SPORT_MISMATCH";
    readonly INVALID_STATE: "INVALID_STATE";
    readonly INTERNAL: "INTERNAL";
    readonly LOT_NOT_LIVE: "LOT_NOT_LIVE";
    readonly BAD_AMOUNT: "BAD_AMOUNT";
    readonly TEAM_FULL: "TEAM_FULL";
    readonly RESERVE_EXCEEDED: "RESERVE_EXCEEDED";
    readonly OUTBID: "OUTBID";
    readonly STALE_VERSION: "STALE_VERSION";
    readonly DUPLICATE_BID: "DUPLICATE_BID";
    readonly NO_LEADER: "NO_LEADER";
    readonly MIN_NOT_MET: "MIN_NOT_MET";
};
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
/** Typed error response body returned by every endpoint on failure. */
export interface ApiError {
    code: ErrorCode | string;
    message: string;
    details?: unknown;
}
