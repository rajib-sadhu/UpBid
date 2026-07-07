import { z } from "zod";
import type { Role, UserStatus } from "./roles.js";
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type LoginInput = z.infer<typeof loginSchema>;
export declare const createUserSchema: z.ZodObject<{
    email: z.ZodString;
    name: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
    password: string;
}, {
    name: string;
    email: string;
    password: string;
}>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export declare const createOrganizerSchema: z.ZodObject<{
    email: z.ZodString;
    name: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
    password: string;
}, {
    name: string;
    email: string;
    password: string;
}>;
export type CreateOrganizerInput = CreateUserInput;
export declare const createFranchiseUserSchema: z.ZodObject<{
    email: z.ZodString;
    name: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
    password: string;
}, {
    name: string;
    email: string;
    password: string;
}>;
export type CreateFranchiseUserInput = CreateUserInput;
export declare const changePasswordSchema: z.ZodEffects<z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export declare const resetPasswordSchema: z.ZodObject<{
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
}, {
    password: string;
}>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export declare const updateProfileSchema: z.ZodObject<{
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
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
