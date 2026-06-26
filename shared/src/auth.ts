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
export const createOrganizerSchema = createUserSchema;
export type CreateOrganizerInput = CreateUserInput;
export const createFranchiseSchema = createUserSchema;
export type CreateFranchiseInput = CreateUserInput;

/** A user as exposed over the wire — never includes passwordHash. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  createdById: string | null;
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  user: PublicUser;
}
