import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { Card } from "../../components/ui/card.js";

interface MySeason {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  auctionCount: number;
  participating: boolean;
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

/** A league's seasons, from the franchise owner's side. */
export function MyLeagueSeasonsPage() {
  const { leagueId = "" } = useParams();
  const { user } = useAuth();
  const isFranchise = user?.role === "FRANCHISE";
  const [seasons, setSeasons] = useState<MySeason[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MySeason[]>(`/api/my/leagues/${leagueId}/seasons`)
      .then(setSeasons)
      .catch(() => setError("Failed to load seasons"));
  }, [leagueId]);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/my/leagues" className="text-sm text-indigo-400 hover:text-indigo-300">
          ← My leagues
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Seasons</h1>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {seasons && seasons.length === 0 && (
        <Card>
          <p className="py-4 text-center text-slate-500">No seasons in this league yet.</p>
        </Card>
      )}
      <div className="space-y-2">
        {seasons?.map((s) => (
          <Link
            key={s.id}
            to={`/my/seasons/${s.id}`}
            className="flex items-center justify-between rounded-lg border border-slate-800 px-4 py-3 hover:border-indigo-500 hover:bg-slate-800/40"
          >
            <div>
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-slate-400">
                {fmtDate(s.startDate)} – {fmtDate(s.endDate)} · {s.auctionCount} auction
                {s.auctionCount === 1 ? "" : "s"}
              </div>
            </div>
            {isFranchise &&
              (s.participating ? (
                <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                  Playing
                </span>
              ) : (
                <span className="rounded bg-slate-700/40 px-2 py-0.5 text-xs text-slate-400">
                  Not selected
                </span>
              ))}
          </Link>
        ))}
      </div>
    </div>
  );
}
