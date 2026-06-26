import type { Request, Response } from "express";
import type { CreateUserInput } from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { createUser } from "./users.service.js";
import { toPublicUser } from "./users.mapper.js";

// SUPER_ADMIN creates ORGANIZERs.
export async function createOrganizer(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateUserInput;
  const user = await createUser({ ...body, role: "ORGANIZER", createdById: req.user!.id });
  res.status(201).json(toPublicUser(user));
}

// ORGANIZER (or SUPER_ADMIN) creates FRANCHISE accounts.
export async function createFranchise(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateUserInput;
  const user = await createUser({ ...body, role: "FRANCHISE", createdById: req.user!.id });
  res.status(201).json(toPublicUser(user));
}

// SUPER_ADMIN sees everyone; ORGANIZER sees only accounts they created.
export async function listUsers(req: Request, res: Response): Promise<void> {
  const actor = req.user!;
  const where = actor.role === "SUPER_ADMIN" ? {} : { createdById: actor.id };
  const users = await prisma.user.findMany({ where, orderBy: { createdAt: "desc" } });
  res.json(users.map(toPublicUser));
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw Errors.notFound();
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw Errors.notFound();
  res.json(toPublicUser(user));
}
