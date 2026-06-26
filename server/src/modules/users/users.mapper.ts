import type { User } from "@prisma/client";
import type { PublicUser } from "shared";

/** Strip secrets (passwordHash, inviteToken) and shape for the wire. */
export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    createdById: u.createdById,
    createdAt: u.createdAt.toISOString(),
  };
}
