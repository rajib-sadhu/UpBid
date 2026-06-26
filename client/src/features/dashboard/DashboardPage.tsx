import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Auction } from "shared";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { Card } from "../../components/ui/card.js";

const ROLE_BLURB: Record<string, string> = {
  SUPER_ADMIN: "You have full access: create organizers and manage everything across the system.",
  ORGANIZER: "Create franchises and run leagues, seasons and auctions.",
  FRANCHISE: "Manage your team, bid in live auctions and build your lineup (later phases).",
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-500/15 text-slate-300",
  LIVE: "bg-emerald-500/15 text-emerald-400",
  PAUSED: "bg-amber-500/15 text-amber-400",
  RE_AUCTION: "bg-indigo-500/15 text-indigo-300",
  ASSIGNMENT: "bg-indigo-500/15 text-indigo-300",
  COMPLETED: "bg-slate-700/40 text-slate-400",
};

export function DashboardPage() {
  const { user } = useAuth();
  const [auctions, setAuctions] = useState<Auction[]>([]);

  useEffect(() => {
    apiFetch<Auction[]>("/api/auctions/mine")
      .then(setAuctions)
      .catch(() => setAuctions([]));
  }, []);

  if (!user) return null;
  const liveOrActive = auctions.filter((a) => a.status !== "DRAFT");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
        <p className="text-slate-400">{ROLE_BLURB[user.role]}</p>
      </div>

      {(user.role === "SUPER_ADMIN" || user.role === "ORGANIZER") && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <h2 className="mb-2 font-medium">Leagues</h2>
            <p className="mb-4 text-sm text-slate-400">Create leagues, seasons and manage bans.</p>
            <Link to="/leagues" className="text-sm text-indigo-400 hover:text-indigo-300">
              Go to Leagues →
            </Link>
          </Card>
          <Card>
            <h2 className="mb-2 font-medium">Players</h2>
            <p className="mb-4 text-sm text-slate-400">Manage the global player pool and photos.</p>
            <Link to="/players" className="text-sm text-indigo-400 hover:text-indigo-300">
              Go to Players →
            </Link>
          </Card>
          <Card>
            <h2 className="mb-2 font-medium">User management</h2>
            <p className="mb-4 text-sm text-slate-400">
              {user.role === "SUPER_ADMIN"
                ? "Create organizer accounts."
                : "Create franchise accounts."}
            </p>
            <Link to="/users" className="text-sm text-indigo-400 hover:text-indigo-300">
              Go to Users →
            </Link>
          </Card>
        </div>
      )}

      <Card>
        <h2 className="mb-3 font-medium">
          {user.role === "FRANCHISE" ? "Your auctions" : "Live & active auctions"}
        </h2>
        {liveOrActive.length === 0 ? (
          <p className="text-sm text-slate-400">No active auctions right now.</p>
        ) : (
          <div className="space-y-2">
            {liveOrActive.map((a) => (
              <Link
                key={a.id}
                to={`/auctions/${a.id}/live`}
                className="flex items-center justify-between rounded-md border border-slate-800 px-3 py-2 hover:bg-slate-800/50"
              >
                <span className="font-medium">{a.name}</span>
                <span className="flex items-center gap-3">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[a.status] ?? ""}`}>
                    {a.status}
                  </span>
                  <span className="text-sm text-indigo-400">Open →</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
