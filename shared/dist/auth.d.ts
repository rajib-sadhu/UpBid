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
export declare const createFranchiseSchema: z.ZodObject<{
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
