import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext.js";
import { Button } from "./ui/button.js";

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const canManageUsers = user?.role === "SUPER_ADMIN" || user?.role === "ORGANIZER";

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-y-2 border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="hud-label text-lg font-bold text-indigo-300">
            Sports Auction
          </Link>
          <nav className="hud-label flex gap-4 text-xs text-slate-400">
            <Link to="/" className="hover:text-slate-100">
              Dashboard
            </Link>
            {canManageUsers && (
              <>
                <Link to="/leagues" className="hover:text-slate-100">
                  Leagues
                </Link>
                <Link to="/players" className="hover:text-slate-100">
                  Players
                </Link>
                <Link to="/users" className="hover:text-slate-100">
                  Users
                </Link>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400">
            {user?.email} · <span className="text-slate-500">{user?.role}</span>
          </span>
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] p-6">
        <Outlet />
      </main>
    </div>
  );
}
