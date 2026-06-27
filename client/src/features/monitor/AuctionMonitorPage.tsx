import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AuctionMonitor, MonitorTeam } from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { Card } from "../../components/ui/card.js";
import { Button } from "../../components/ui/button.js";
import { StatusBadge, fmtCr, PlayerIcon } from "../auction-live/widgets.js";

const LINEUP_STYLES: Record<string, string> = {
  LOCKED: "bg-emerald-500/15 text-emerald-400",
  DRAFT: "bg-amber-500/15 text-amber-400",
  NONE: "bg-slate-700/40 text-slate-400",
};

function LineupBadge({ status }: { status: string }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${LINEUP_STYLES[status] ?? "bg-slate-700/40"}`}>
      {status === "NONE" ? "No lineup" : status}
    </span>
  );
}

function ProgressBar({ data }: { data: AuctionMonitor["progress"] }) {
  const segs = [
    { key: "SOLD", n: data.SOLD, cls: "bg-emerald-500" },
    { key: "ASSIGNED", n: data.ASSIGNED, cls: "bg-indigo-500" },
    { key: "ON_BLOCK", n: data.ON_BLOCK, cls: "bg-amber-500" },
    { key: "UNSOLD", n: data.UNSOLD, cls: "bg-rose-500/70" },
    { key: "PENDING", n: data.PENDING, cls: "bg-slate-600" },
  ];
  const total = data.total || 1;
  return (
    <div>
      <div className="mb-2 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
        {segs.map((s) =>
          s.n > 0 ? (
            <div key={s.key} className={s.cls} style={{ width: `${(s.n / total) * 100}%` }} />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>Sold {data.SOLD}</span>
        <span>Assigned {data.ASSIGNED}</span>
        <span>On block {data.ON_BLOCK}</span>
        <span>Unsold {data.UNSOLD}</span>
        <span>Pending {data.PENDING}</span>
        <span className="text-slate-300">Total {data.total}</span>
      </div>
    </div>
  );
}

function TeamCard({ team, canManage }: { team: MonitorTeam; canManage: boolean }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: team.primaryColor ?? "#475569" }}
          />
          <div className="min-w-0">
            <h3 className="truncate font-medium">
              {team.name}
              {team.shortName ? (
                <span className="ml-1 text-xs text-slate-500">({team.shortName})</span>
              ) : null}
            </h3>
            <p className="truncate text-xs text-slate-500">{team.ownerName ?? "No owner"}</p>
          </div>
        </div>
        <LineupBadge status={team.lineupStatus} />
      </div>

      <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-400">Spent</dt>
        <dd className="text-right">{fmtCr(team.committedAmount)}</dd>
        <dt className="text-slate-400">Remaining</dt>
        <dd className="text-right">{fmtCr(team.remainingCredit)}</dd>
        <dt className="text-slate-400">Max bid</dt>
        <dd className="text-right">{fmtCr(team.maxBid)}</dd>
        <dt className="text-slate-400">Players</dt>
        <dd className={`text-right ${team.belowMinimum ? "text-amber-400" : ""}`}>
          {team.playerCount}
          {team.belowMinimum ? " (below min)" : ""}
        </dd>
      </dl>

      {team.squad.length === 0 ? (
        <p className="text-xs text-slate-500">No players yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {team.squad.map((p) => (
            <li key={p.teamPlayerId} className="flex items-center gap-2">
              <PlayerIcon name={p.playerName} photoUrl={p.photoUrl} />
              <span className="min-w-0 flex-1 truncate">
                {p.playerName}
                {p.footballPosition ? (
                  <span className="ml-1 text-xs text-slate-500">{p.footballPosition}</span>
                ) : p.role ? (
                  <span className="ml-1 text-xs text-slate-500">{p.role}</span>
                ) : null}
                {p.isOverseas ? <span className="ml-1 text-xs text-indigo-400">✈</span> : null}
              </span>
              <span className="shrink-0 text-slate-400">{fmtCr(p.price)}</span>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="mt-3 border-t border-slate-800 pt-3">
          <Link
            to={`/teams/${team.id}/lineup`}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            View lineup →
          </Link>
        </div>
      )}
    </Card>
  );
}

export function AuctionMonitorPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AuctionMonitor | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await apiFetch<AuctionMonitor>(`/api/monitor/auctions/${id}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to load the monitor");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Card>
        <p className="text-rose-400">{error}</p>
        <Link to="/" className="mt-2 inline-block text-sm text-indigo-400 hover:text-indigo-300">
          ← Back to dashboard
        </Link>
      </Card>
    );
  }
  if (!data) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {data.name}
            <StatusBadge status={data.status} />
          </h1>
          <p className="text-sm text-slate-400">
            {data.leagueName} · {data.seasonName} · {data.sport} · {data.biddingMode} bidding
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
          {data.status !== "DRAFT" && data.status !== "COMPLETED" && (
            <Link
              to={`/auctions/${data.auctionId}/live`}
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Open live →
            </Link>
          )}
        </div>
      </div>

      <Card>
        <h2 className="mb-3 font-medium">Lot progress</h2>
        <ProgressBar data={data.progress} />
        {data.rules && (
          <p className="mt-3 text-xs text-slate-500">
            Budget {fmtCr(data.rules.creditPerTeam)} · squad {data.rules.minPlayersPerTeam}–
            {data.rules.maxPlayersPerTeam} · unsold price {fmtCr(data.rules.unsoldPrice)}
          </p>
        )}
      </Card>

      <div>
        <h2 className="mb-3 font-medium">Teams ({data.teams.length})</h2>
        {data.teams.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-400">No teams in this auction yet.</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.teams.map((t) => (
              <TeamCard key={t.id} team={t} canManage={data.canManage} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
