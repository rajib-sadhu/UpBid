import type { Request, Response } from "express";
import type { LoginInput } from "shared";
import { prisma } from "../../lib/prisma.js";
import { verifyPassword } from "../../lib/password.js";
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
