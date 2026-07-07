import { z } from "zod";
import type { Role, UserStatus } from "./roles.js";

// Emails are normalized (trim + lowercase) before validation so accounts and logins
// are case-insensitive — "Admin@x.com" and "admin@x.com" are the same identity.
const emailSchema = z.string().trim().toLowerCase().email();

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// A parent role provisions a child account directly with an initial password.
export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

// Same shape today; kept as distinct names so the two endpoints can diverge later.
// NOTE: createFranchiseUserSchema provisions a franchise USER ACCOUNT — distinct
// from the league-level Franchise entity (franchise.ts), a team identity that such
// a user can own.
export const createOrganizerSchema = createUserSchema;
export type CreateOrganizerInput = CreateUserInput;
export const createFranchiseUserSchema = createUserSchema;
export type CreateFranchiseUserInput = CreateUserInput;

// First-login (or post-reset) forced password change: the account holder proves
// the provisioned password, then replaces it with one of their own.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// Creator (organizer/admin) resets a child account's password → the account
// must change it again on its next login.
export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// Self-service profile edit — name only. Email is the login identity and is
// immutable; passwords go through changePasswordSchema.
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** One organization line on the profile page. */
export interface ProfileAffiliation {
  /** e.g. "Mumbai Premier League" or "Mumbai Warriors (MPA) — Mumbai Premier League" */
  name: string;
  /** "Organizer" | "Franchise owner" */
  role: string;
}

export interface MyProfile {
  user: PublicUser;
  affiliations: ProfileAffiliation[];
}

/** A user as exposed over the wire — never includes passwordHash. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  /** Password was set by someone else — must be changed before using the app. */
  mustChangePassword: boolean;
  createdById: string | null;
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  user: PublicUser;
}
