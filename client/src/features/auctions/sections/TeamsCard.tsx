import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SeasonFranchisesData } from "shared";
import { apiFetch } from "../../../api/client.js";
import { Card } from "../../../components/ui/card.js";
import { ColorSwatch } from "../../../components/ui/color-swatch.js";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

// Read-only participants view. Teams are the league franchises selected for this
// auction's season; they become bidding teams at go-live. Franchises are managed
// on the league page, participation on the season page.
export function TeamsCard({ seasonId }: { seasonId: string }) {
  const [data, setData] = useState<SeasonFranchisesData | null>(null);

  useEffect(() => {
    apiFetch<SeasonFranchisesData>(`/api/seasons/${seasonId}/franchises`)
      .then(setData)
      .catch(() => setData(null));
  }, [seasonId]);

  const selected = data?.franchises.filter((f) => f.selected) ?? [];

  return (
    <Card className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="font-medium">Participating teams ({selected.length})</h2>
        <Link
          to={`/seasons/${seasonId}`}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          Manage on season →
        </Link>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Teams are the franchises selected for this season; they become bidding teams when the
        auction goes live. Create franchises on the league page and pick participants on the season
        page.
      </p>
      {selected.length === 0 ? (
        <p className="py-3 text-center text-slate-500">No teams selected for this season yet.</p>
      ) : (
        <div className="space-y-2">
          {selected.map((f) => (
            <div
              key={f.franchiseId}
              className="flex items-center gap-3 rounded-lg border border-slate-800 px-3 py-2"
            >
              <ColorSwatch primary={f.primaryColor} secondary={f.secondaryColor} className="h-3 w-3" />
              {f.logoUrl ? (
                <img src={`${API_BASE}${f.logoUrl}`} alt="" className="h-7 w-7 rounded object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {f.name} <span className="text-slate-500">({f.shortName})</span>
                </div>
                <div className="truncate text-xs text-slate-400">{f.ownerName ?? "No owner"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
