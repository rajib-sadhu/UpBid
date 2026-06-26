import type { Request, RequestHandler } from "express";
import type { Role } from "shared";
import { verifyToken } from "./jwt.js";
import { Errors } from "../lib/errors.js";
import "./types.js";

/** Verify the Bearer token and attach req.user. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(Errors.unauthenticated());
    return;
  }
  try {
    const payload = verifyToken(header.slice("Bearer ".length));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(Errors.unauthenticated("Invalid or expired token"));
  }
};

/** Allow only the listed roles. SUPER_ADMIN is included explicitly where it applies. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) {
      next(Errors.unauthenticated());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(Errors.forbidden());
      return;
    }
    next();
  };

/**
 * Ownership gate. SUPER_ADMIN always bypasses. Otherwise the resolver returns the
 * userId that owns the target resource (or null if the resource doesn't exist); the
 * acting user must match it.
 */
export const requireOwnership =
  (resolveOwnerId: (req: Request) => Promise<string | null> | string | null): RequestHandler =>
  async (req, _res, next) => {
    try {
      if (!req.user) {
        next(Errors.unauthenticated());
        return;
      }
      if (req.user.role === "SUPER_ADMIN") {
        next();
        return;
      }
      const ownerId = await resolveOwnerId(req);
      if (ownerId === null) {
        next(Errors.notFound());
        return;
      }
      if (ownerId !== req.user.id) {
        next(Errors.forbidden());
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
