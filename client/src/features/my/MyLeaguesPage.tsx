import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { Card } from "../../components/ui/card.js";
import { ColorSwatch } from "../../components/ui/color-swatch.js";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface MyLeague {
  id: string;
  name: string;
  shortName: string;
  sport: string;
  seasonCount: number;
  myFranchises: {
    id: string;
    name: string;
    shortName: string;
    primaryColor: string | null;
    logoUrl: string | null;
  }[];
}

/** The teams browser: a franchise owner's leagues, an organizer's leagues, or
 * (super-admin) every league — each drilling into seasons → teams → lineups. */
export function MyLeaguesPage() {
  const { user } = useAuth();
  const isFranchise = user?.role === "FRANCHISE";
  const [leagues, setLeagues] = useState<MyLeague[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MyLeague[]>("/api/my/leagues")
      .then(setLeagues)
      .catch(() => setError("Failed to load your leagues"));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{isFranchise ? "My leagues" : "Teams by league"}</h1>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {leagues && leagues.length === 0 && (
        <Card>
          <p className="py-4 text-center text-slate-500">
            {isFranchise ? "You don't own a franchise in any league yet." : "No leagues yet."}
          </p>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {leagues?.map((l) => (
          <Link
            key={l.id}
            to={`/my/leagues/${l.id}`}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-indigo-500"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium">
                {l.name} <span className="text-xs text-slate-500">({l.shortName})</span>
              </h2>
              <span className="text-xs text-slate-500">{l.sport}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {l.seasonCount} season{l.seasonCount === 1 ? "" : "s"}
            </p>
            <div className="mt-3 space-y-1">
              {l.myFranchises.map((f) => (
                <div key={f.id} className="flex items-center gap-2 text-sm text-slate-300">
                  <ColorSwatch primary={f.primaryColor} secondary={null} className="h-3 w-3" />
                  {f.logoUrl ? (
                    <img
                      src={`${API_BASE}${f.logoUrl}`}
                      alt=""
                      className="h-5 w-5 rounded object-cover"
                    />
                  ) : null}
                  <span className="truncate">
                    {f.name} <span className="text-slate-500">({f.shortName})</span>
                  </span>
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
