export declare const ROLES: readonly ["SUPER_ADMIN", "ORGANIZER", "FRANCHISE"];
export type Role = (typeof ROLES)[number];
export declare const USER_STATUSES: readonly ["INVITED", "ACTIVE", "SUSPENDED"];
export type UserStatus = (typeof USER_STATUSES)[number];
