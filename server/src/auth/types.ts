import type { Role } from "shared";

export interface AuthUser {
  id: string;
  role: Role;
}

// Augment Express's Request so `req.user` is typed everywhere after authenticate().
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
