import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Auction, MyTeamSummary } from "shared";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { Card } from "../../components/ui/card.js";
import { ColorSwatch } from "../../components/ui/color-swatch.js";
import { fmtCr } from "../auction-live/widgets.js";

const ROLE_BLURB: Record<string, string> = {
  SUPER_ADMIN: "You have full access: create organizers and manage everything across the system.",
  ORGANIZER: "Create franchises and run leagues, seasons and auctions.",
  FRANCHISE: "Manage your team, bid in live auctions and build your lineup.",
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-500/15 text-slate-300",
  LIVE: "bg-emerald-500/15 text-emerald-400",
  PAUSED: "bg-amber-500/15 text-amber-400",
  RE_AUCTION: "bg-indigo-500/15 text-indigo-300",
  ASSIGNMENT: "bg-indigo-500/15 text-indigo-300",
  COMPLETED: "bg-slate-700/40 text-slate-400",
};

const LINEUP_LABEL: Record<string, string> = {
  LOCKED: "Lineup locked",
  DRAFT: "Lineup draft",
  NONE: "Build lineup",
};

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[status] ?? ""}`}>{status}</span>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [myTeams, setMyTeams] = useState<MyTeamSummary[]>([]);

  useEffect(() => {
    apiFetch<Auction[]>("/api/auctions/mine")
      .then(setAuctions)
      .catch(() => setAuctions([]));
  }, []);

  useEffect(() => {
    if (user?.role !== "FRANCHISE") return;
    apiFetch<MyTeamSummary[]>("/api/monitor/my-teams")
      .then(setMyTeams)
      .catch(() => setMyTeams([]));
  }, [user?.role]);

  if (!user) return null;
  const isManager = user.role === "SUPER_ADMIN" || user.role === "ORGANIZER";
  const liveOrActive = auctions.filter((a) => a.status !== "DRAFT");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
        <p className="text-slate-400">{ROLE_BLURB[user.role]}</p>
      </div>

      {isManager && (
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

      {/* Franchise: their teams across auctions with budget + lineup state. */}
      {user.role === "FRANCHISE" && myTeams.length > 0 && (
        <Card>
          <h2 className="mb-3 font-medium">Your teams</h2>
          <div className="space-y-2">
            {myTeams.map((t) => (
              <div
                key={t.teamId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-800 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ColorSwatch
                    primary={t.primaryColor}
                    secondary={t.secondaryColor}
                    className="h-3 w-3"
                  />
                  <span className="font-medium">{t.teamName}</span>
                  <span className="ml-1 text-xs text-slate-500">{t.auctionName}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-slate-400">
                    {t.playerCount} players · {fmtCr(t.remainingCredit)} left
                  </span>
                  <StatusChip status={t.auctionStatus} />
                  <Link
                    to={`/auctions/${t.auctionId}/monitor`}
                    className="text-indigo-400 hover:text-indigo-300"
                  >
                    Monitor
                  </Link>
                  {t.auctionStatus === "COMPLETED" && (
                    <Link
                      to={`/teams/${t.teamId}/lineup`}
                      className="text-indigo-400 hover:text-indigo-300"
                    >
                      {LINEUP_LABEL[t.lineupStatus] ?? "Lineup"}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
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
              <div
                key={a.id}
                className="flex items-center justify-between rounded-md border border-slate-800 px-3 py-2"
              >
                <span className="font-medium">{a.name}</span>
                <span className="flex items-center gap-3">
                  <StatusChip status={a.status} />
                  <Link
                    to={`/auctions/${a.id}/monitor`}
                    className="text-sm text-indigo-400 hover:text-indigo-300"
                  >
                    Monitor
                  </Link>
                  <Link
                    to={`/auctions/${a.id}/live`}
                    className="text-sm text-indigo-400 hover:text-indigo-300"
                  >
                    Live →
                  </Link>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
