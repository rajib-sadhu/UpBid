import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Auction, AuctionMonitor, MonitorTeam } from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { Card } from "../../components/ui/card.js";
import { CricketRoleIcon } from "../../components/ui/role-icon.js";
import { StatusBadge, fmtCr, PlayerIcon } from "../auction-live/widgets.js";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface SeasonAuctions {
  seasonName: string;
  leagueName: string;
  auctions: Auction[];
}

const LINEUP_STYLES: Record<string, string> = {
  LOCKED: "bg-emerald-500/15 text-emerald-400",
  DRAFT: "bg-amber-500/15 text-amber-400",
  NONE: "bg-slate-700/40 text-slate-400",
};

/** One team's card: budget summary, lineup status/action, expandable squad. */
function TeamCard({
  team,
  myUserId,
  canManage,
  onChanged,
}: {
  team: MonitorTeam;
  myUserId: string | undefined;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isMine = team.ownerUserId != null && team.ownerUserId === myUserId;
  const locked = team.lineupStatus === "LOCKED";
  const canEdit = isMine || canManage; // organizer/admin may set any team's lineup

  async function toggleLock() {
    setBusy(true);
    setActionError(null);
    try {
      await apiFetch(`/api/teams/${team.id}/lineup/${locked ? "unlock" : "lock"}`, {
        method: "POST",
      });
      onChanged();
    } catch (e) {
      setActionError(
        e instanceof ApiClientError ? e.message : "Failed to change the lineup lock",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={isMine ? "border-indigo-600" : undefined}>
      <div className="mb-2 flex items-center gap-2">
        {team.logoUrl ? (
          <img src={`${API_BASE}${team.logoUrl}`} alt="" className="h-8 w-8 rounded object-cover" />
        ) : team.primaryColor ? (
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: team.primaryColor }} />
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">
            {team.name}
            {isMine && <span className="ml-1.5 text-xs text-indigo-400">your team</span>}
          </h3>
          <p className="truncate text-xs text-slate-500">{team.ownerName ?? "No owner"}</p>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-xs ${LINEUP_STYLES[team.lineupStatus] ?? LINEUP_STYLES.NONE}`}
        >
          {team.lineupStatus === "NONE" ? "NO LINEUP" : team.lineupStatus}
        </span>
      </div>

      <dl className="mb-3 grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-400">Spent</dt>
        <dt className="text-slate-400">Left</dt>
        <dt className="text-slate-400">Players</dt>
        <dd>{fmtCr(team.committedAmount)}</dd>
        <dd>{fmtCr(team.remainingCredit)}</dd>
        <dd>{team.playerCount}</dd>
      </dl>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-2 text-sm">
        {canEdit ? (
          <Link to={`/teams/${team.id}/lineup`} className="text-indigo-400 hover:text-indigo-300">
            Edit lineup →
          </Link>
        ) : locked ? (
          <Link
            to={`/teams/${team.id}/lineup/view`}
            className="text-indigo-400 hover:text-indigo-300"
          >
            View lineup →
          </Link>
        ) : (
          <span className="text-slate-600">Lineup not locked yet</span>
        )}
        {canEdit && locked && (
          <Link
            to={`/teams/${team.id}/lineup/view`}
            className="text-indigo-400 hover:text-indigo-300"
          >
            View →
          </Link>
        )}
        {canManage && team.lineupStatus !== "NONE" && (
          <button
            type="button"
            disabled={busy}
            className={locked ? "text-amber-400 hover:text-amber-300" : "text-emerald-400 hover:text-emerald-300"}
            onClick={() => void toggleLock()}
          >
            {busy ? "…" : locked ? "Unlock" : "Lock"}
          </button>
        )}
        <button
          type="button"
          className="ml-auto text-slate-400 hover:text-slate-200"
          onClick={() => setOpen((v) => !v)}
        >
          Squad {open ? "▴" : "▾"}
        </button>
      </div>

      {actionError && <p className="mt-2 text-xs text-red-400">{actionError}</p>}

      {open && (
        <ul className="mt-2 space-y-1 border-t border-slate-800 pt-2 text-sm">
          {team.squad.length === 0 && <li className="text-xs text-slate-500">No players.</li>}
          {team.squad.map((p) => (
            <li key={p.teamPlayerId} className="flex items-center gap-2">
              <PlayerIcon name={p.playerName} photoUrl={p.photoUrl} />
              <CricketRoleIcon
                cricketRole={p.cricketRole}
                bowlingStyle={p.bowlingStyle}
                className="h-3.5 w-3.5"
              />
              <span className="min-w-0 flex-1 truncate">
                {p.playerName}
                {p.isOverseas ? <span className="ml-1 text-xs text-sky-400">✈</span> : null}
              </span>
              <span className="shrink-0 text-slate-400">{fmtCr(p.price)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** One auction of the season: header + team cards (if I may view its detail). */
function AuctionTeams({ auction, myUserId }: { auction: Auction; myUserId: string | undefined }) {
  const [monitor, setMonitor] = useState<AuctionMonitor | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(() => {
    apiFetch<AuctionMonitor>(`/api/monitor/auctions/${auction.id}`)
      .then(setMonitor)
      .catch(() => setDenied(true));
  }, [auction.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-medium">{auction.name}</h2>
        <StatusBadge status={auction.status} />
        <Link
          to={`/auctions/${auction.id}/live`}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          Auction results →
        </Link>
      </div>
      {denied && (
        <p className="text-sm text-slate-500">
          Your franchise didn't take part in this auction, so its teams aren't visible.
        </p>
      )}
      {monitor && monitor.teams.length === 0 && (
        <p className="text-sm text-slate-500">No teams yet (auction not live).</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {monitor?.teams.map((t) => (
          <TeamCard
            key={t.id}
            team={t}
            myUserId={myUserId}
            canManage={monitor.canManage}
            onChanged={load}
          />
        ))}
      </div>
    </section>
  );
}

/** Season page from the team's side: every auction with its teams + lineups. */
export function SeasonTeamsPage() {
  const { seasonId = "" } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<SeasonAuctions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SeasonAuctions>(`/api/my/seasons/${seasonId}/auctions`)
      .then(setData)
      .catch(() => setError("Failed to load the season"));
  }, [seasonId]);

  const auctions = (data?.auctions ?? []).filter(
    (a) => a.status !== "DRAFT" && a.status !== "CANCELLED",
  );

  return (
    <div className="space-y-6">
      <div>
        <Link to="/my/leagues" className="text-sm text-indigo-400 hover:text-indigo-300">
          ← My leagues
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">
          {data ? `${data.leagueName} · ${data.seasonName}` : "Season"}
        </h1>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {data && auctions.length === 0 && (
        <Card>
          <p className="py-4 text-center text-slate-500">No auction has run in this season yet.</p>
        </Card>
      )}
      <div className="space-y-8">
        {auctions.map((a) => (
          <AuctionTeams key={a.id} auction={a} myUserId={user?.id} />
        ))}
      </div>
    </div>
  );
}
