import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createAuctionSchema, BIDDING_MODES } from "shared";
import type { CreateAuctionInput, Season, Auction, SeasonFranchisesData } from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { ColorSwatch } from "../../components/ui/color-swatch.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Select } from "../../components/ui/select.js";
import { Label } from "../../components/ui/label.js";
import { Card } from "../../components/ui/card.js";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-500/15 text-slate-300",
  LIVE: "bg-emerald-500/15 text-emerald-400",
  PAUSED: "bg-amber-500/15 text-amber-400",
  RE_AUCTION: "bg-indigo-500/15 text-indigo-300",
  ASSIGNMENT: "bg-indigo-500/15 text-indigo-300",
  COMPLETED: "bg-slate-700/40 text-slate-400",
};

export function SeasonDetailPage() {
  const { seasonId = "" } = useParams();
  const [season, setSeason] = useState<Season | null>(null);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [teamData, setTeamData] = useState<SeasonFranchisesData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingTeams, setSavingTeams] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateAuctionInput>({
    resolver: zodResolver(createAuctionSchema),
    defaultValues: { name: "", biddingMode: "FRANCHISE" },
  });

  const load = useCallback(async () => {
    const [s, au, tf] = await Promise.all([
      apiFetch<Season>(`/api/seasons/${seasonId}`),
      apiFetch<Auction[]>(`/api/seasons/${seasonId}/auctions`),
      apiFetch<SeasonFranchisesData>(`/api/seasons/${seasonId}/franchises`),
    ]);
    setSeason(s);
    setAuctions(au);
    setTeamData(tf);
    setSelected(new Set(tf.franchises.filter((f) => f.selected).map((f) => f.franchiseId)));
  }, [seasonId]);

  useEffect(() => {
    load().catch(() => setError("Failed to load season"));
  }, [load]);

  function toggleTeam(franchiseId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(franchiseId)) next.delete(franchiseId);
      else next.add(franchiseId);
      return next;
    });
  }

  async function saveTeams() {
    setSavingTeams(true);
    setError(null);
    try {
      const data = await apiFetch<SeasonFranchisesData>(`/api/seasons/${seasonId}/franchises`, {
        method: "PUT",
        body: JSON.stringify({ franchiseIds: [...selected] }),
      });
      setTeamData(data);
      setSelected(new Set(data.franchises.filter((f) => f.selected).map((f) => f.franchiseId)));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to save teams");
    } finally {
      setSavingTeams(false);
    }
  }

  async function onCreate(values: CreateAuctionInput) {
    setError(null);
    try {
      await apiFetch(`/api/seasons/${seasonId}/auctions`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      reset();
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to create auction");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        {season && (
          <Link to={`/leagues/${season.leagueId}`} className="text-sm text-indigo-400 hover:text-indigo-300">
            ← League
          </Link>
        )}
        <h1 className="mt-1 text-2xl font-semibold">Season {season?.name ?? ""}</h1>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Participating teams — pick which league franchises play this season */}
      <Card>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="font-medium">Participating teams ({selected.size})</h2>
          {season && (
            <Link
              to={`/leagues/${season.leagueId}`}
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              + Add teams on league
            </Link>
          )}
        </div>
        <p className="mb-4 text-xs text-slate-500">
          {teamData?.locked
            ? "Locked — an auction in this season has gone live, so the team list can no longer change."
            : "Tick the franchises that play this season. They become bidding teams when an auction goes live."}
        </p>
        {teamData && teamData.franchises.length === 0 ? (
          <p className="py-3 text-center text-slate-500">
            No franchises in this league yet — create them on the league page.
          </p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {teamData?.franchises.map((f) => (
                <label
                  key={f.franchiseId}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                    selected.has(f.franchiseId)
                      ? "border-indigo-500 bg-slate-800/40"
                      : "border-slate-800"
                  } ${teamData.locked ? "opacity-60" : "cursor-pointer hover:border-indigo-500"}`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selected.has(f.franchiseId)}
                    disabled={teamData.locked}
                    onChange={() => toggleTeam(f.franchiseId)}
                  />
                  <ColorSwatch
                    primary={f.primaryColor}
                    secondary={f.secondaryColor}
                    className="h-3 w-3"
                  />
                  {f.logoUrl ? (
                    <img
                      src={`${API_BASE}${f.logoUrl}`}
                      alt=""
                      className="h-6 w-6 rounded object-cover"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">
                    {f.name} <span className="text-slate-500">({f.shortName})</span>
                  </span>
                </label>
              ))}
            </div>
            {!teamData?.locked && (
              <Button className="mt-4" onClick={() => void saveTeams()} disabled={savingTeams}>
                {savingTeams ? "Saving…" : "Save teams"}
              </Button>
            )}
          </>
        )}
      </Card>

      <div className="grid gap-6 md:grid-cols-[20rem_1fr]">
        <Card className="h-fit">
          <h2 className="mb-4 font-medium">Create auction</h2>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="biddingMode">Bidding mode</Label>
              <Select id="biddingMode" {...register("biddingMode")}>
                {BIDDING_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create auction"}
            </Button>
          </form>
        </Card>

        <Card className="min-w-0">
          <h2 className="mb-4 font-medium">Auctions ({auctions.length})</h2>
          <div className="space-y-2">
            {auctions.map((au) => (
              <Link
                key={au.id}
                to={`/auctions/${au.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-800 px-4 py-3 hover:border-indigo-500 hover:bg-slate-800/40"
              >
                <div>
                  <div className="font-medium">{au.name}</div>
                  <div className="text-xs text-slate-400">
                    {au.biddingMode} mode · {au.teamCount ?? 0} teams · {au.lotCount ?? 0} lots
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[au.status] ?? "bg-slate-700 text-slate-300"}`}
                >
                  {au.status}
                </span>
              </Link>
            ))}
            {auctions.length === 0 && (
              <p className="py-4 text-center text-slate-500">No auctions yet.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
