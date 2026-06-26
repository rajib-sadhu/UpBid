import type { Role, User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/password.js";
import { Errors } from "../../lib/errors.js";

interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: Role;
  createdById: string;
}

/** Provision a child account directly (no email/invite flow): ACTIVE immediately. */
export async function createUser(input: CreateUserInput): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw Errors.emailTaken();

  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      status: "ACTIVE",
      passwordHash,
      activatedAt: new Date(),
      createdById: input.createdById,
    },
  });
}
