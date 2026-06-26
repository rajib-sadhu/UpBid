import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSeasonSchema } from "shared";
import type { CreateSeasonInput, League, Season, LeaguePlayer, Paginated } from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Label } from "../../components/ui/label.js";
import { Card } from "../../components/ui/card.js";

const PAGE_SIZE = 10;

export function LeagueDetailPage() {
  const { id = "" } = useParams();
  const [league, setLeague] = useState<League | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [players, setPlayers] = useState<LeaguePlayer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateSeasonInput>({
    resolver: zodResolver(createSeasonSchema),
    defaultValues: { name: "", startDate: "", endDate: "" },
  });

  const loadLeague = useCallback(async () => {
    setLeague(await apiFetch<League>(`/api/leagues/${id}`));
    setSeasons(await apiFetch<Season[]>(`/api/leagues/${id}/seasons`));
  }, [id]);

  const loadPlayers = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (q.trim()) params.set("q", q.trim());
    const res = await apiFetch<Paginated<LeaguePlayer>>(
      `/api/leagues/${id}/players?${params.toString()}`,
    );
    setPlayers(res.data);
    setTotal(res.total);
  }, [id, page, q]);

  useEffect(() => {
    loadLeague().catch(() => setError("Failed to load league"));
  }, [loadLeague]);

  useEffect(() => {
    loadPlayers().catch(() => setError("Failed to load players"));
  }, [loadPlayers]);

  async function onCreateSeason(values: CreateSeasonInput) {
    setError(null);
    try {
      await apiFetch(`/api/leagues/${id}/seasons`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      reset();
      await loadLeague();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to create season");
    }
  }

  async function toggleBan(player: LeaguePlayer) {
    setError(null);
    try {
      await apiFetch(`/api/leagues/${id}/players/${player.id}/ban`, {
        method: "PUT",
        body: JSON.stringify({ banned: !player.banned }),
      });
      await loadPlayers();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to update ban status");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <Link to="/leagues" className="text-sm text-indigo-400 hover:text-indigo-300">
          ← Leagues
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{league?.name ?? "League"}</h1>
        {league && <p className="text-slate-400">{league.sport}</p>}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Seasons */}
        <Card>
          <h2 className="mb-4 font-medium">Seasons ({seasons.length})</h2>
          <form onSubmit={handleSubmit(onCreateSeason)} className="mb-4 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name">Season name</Label>
              <Input id="name" placeholder="e.g. 2026" {...register("name")} />
              {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="startDate">Start</Label>
                <Input id="startDate" type="date" {...register("startDate")} />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="endDate">End</Label>
                <Input id="endDate" type="date" {...register("endDate")} />
              </div>
            </div>
            {errors.endDate && <p className="text-xs text-red-400">{errors.endDate.message}</p>}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding…" : "Add season"}
            </Button>
          </form>
          <div className="space-y-2">
            {seasons.map((s) => (
              <Link
                key={s.id}
                to={`/seasons/${s.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-800 px-4 py-2 text-sm hover:border-indigo-500 hover:bg-slate-800/40"
              >
                <span className="font-medium">
                  {s.name}{" "}
                  <span className="text-xs text-slate-500">
                    · {s.auctionCount ?? 0} auction{s.auctionCount === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="text-slate-400">
                  {s.startDate ?? "—"} → {s.endDate ?? "—"}
                </span>
              </Link>
            ))}
            {seasons.length === 0 && (
              <p className="py-3 text-center text-slate-500">No seasons yet.</p>
            )}
          </div>
        </Card>

        {/* Per-league player bans */}
        <Card className="min-w-0">
          <h2 className="mb-1 font-medium">Player availability</h2>
          <p className="mb-4 text-xs text-slate-500">
            Banned players are excluded when building this league's auction lots.
          </p>
          <Input
            placeholder="Search players…"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            className="mb-4 max-w-xs"
          />
          <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-800">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/50">
                  <td className="py-2 font-medium">{p.name}</td>
                  <td className="py-2">
                    {p.banned ? (
                      <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                        Banned
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                        Available
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="outline" onClick={() => void toggleBan(p)}>
                      {p.banned ? "Unban" : "Ban"}
                    </Button>
                  </td>
                </tr>
              ))}
              {players.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-slate-500">
                    No players for this sport yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
            <span>
              Page {page} of {totalPages} · {total} players
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((n) => Math.max(1, n - 1))}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((n) => n + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
