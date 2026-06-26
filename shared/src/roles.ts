// Mirrors the Prisma `Role` enum (same string values) so the client never has to
// import @prisma/client. Server code maps these to Prisma's Role at the DB boundary.
export const ROLES = ["SUPER_ADMIN", "ORGANIZER", "FRANCHISE"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["INVITED", "ACTIVE", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
