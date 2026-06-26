import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { Role } from "shared";
import { env } from "../env.js";

export interface JwtPayload {
  sub: string;
  role: Role;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === "string" || typeof decoded.sub !== "string" || !("role" in decoded)) {
    throw new Error("Malformed token payload");
  }
  return { sub: decoded.sub, role: decoded.role as Role };
}
