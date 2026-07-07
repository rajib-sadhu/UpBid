import type { Request, Response } from "express";
import type { LoginInput, ChangePasswordInput, UpdateProfileInput, MyProfile } from "shared";
import { prisma } from "../../lib/prisma.js";
import { verifyPassword, hashPassword } from "../../lib/password.js";
import { signToken } from "../../auth/jwt.js";
import { Errors } from "../../lib/errors.js";
import { toPublicUser } from "../users/users.mapper.js";

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginInput;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) throw Errors.invalidCredentials();

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw Errors.invalidCredentials();

  // Verify the password before checking status, and return the same generic error,
  // so a disabled/non-existent account can't be distinguished (no user enumeration).
  if (user.status !== "ACTIVE") throw Errors.invalidCredentials();

  const token = signToken({ sub: user.id, role: user.role });
  res.json({ token, user: toPublicUser(user) });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw Errors.notFound();
  res.json(toPublicUser(user));
}

/** Profile page data: the user plus the organizations they belong to. */
export async function getProfile(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw Errors.notFound();

  const affiliations: MyProfile["affiliations"] = [];
  if (user.role === "ORGANIZER") {
    const leagues = await prisma.league.findMany({
      where: { organizerId: user.id },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    affiliations.push(...leagues.map((l) => ({ name: l.name, role: "Organizer" })));
  } else if (user.role === "FRANCHISE") {
    const franchises = await prisma.franchise.findMany({
      where: { ownerUserId: user.id },
      select: { name: true, shortName: true, league: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    affiliations.push(
      ...franchises.map((f) => ({
        name: `${f.name}${f.shortName ? ` (${f.shortName})` : ""} — ${f.league.name}`,
        role: "Franchise owner",
      })),
    );
  }

  const data: MyProfile = { user: toPublicUser(user), affiliations };
  res.json(data);
}

/** Self-service profile edit — name only (email is the immutable login identity). */
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const { name } = req.body as UpdateProfileInput;
  const user = await prisma.user.update({ where: { id: req.user!.id }, data: { name } });
  res.json(toPublicUser(user));
}

/**
 * Self-service password change; also clears the forced-change flag set when the
 * password was provisioned/reset by someone else. Returns a fresh token so the
 * client can swap credentials in place.
 */
export async function changePassword(req: Request, res: Response): Promise<void> {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !user.passwordHash) throw Errors.unauthenticated();

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw Errors.invalidCredentials();

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });
  const token = signToken({ sub: updated.id, role: updated.role });
  res.json({ token, user: toPublicUser(updated) });
}
