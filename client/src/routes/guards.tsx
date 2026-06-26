import { Navigate, Outlet } from "react-router-dom";
import type { Role } from "shared";
import { useAuth } from "../features/auth/AuthContext.js";

/** Gate a subtree behind authentication; waits for the refresh-on-load check. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Gate a subtree behind specific roles. Assumes it nests inside RequireAuth. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
