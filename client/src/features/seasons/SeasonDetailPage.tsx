import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createAuctionSchema, BIDDING_MODES } from "shared";
import type { CreateAuctionInput, Season, Auction } from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Select } from "../../components/ui/select.js";
import { Label } from "../../components/ui/label.js";
import { Card } from "../../components/ui/card.js";

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
    setSeason(await apiFetch<Season>(`/api/seasons/${seasonId}`));
    setAuctions(await apiFetch<Auction[]>(`/api/seasons/${seasonId}/auctions`));
  }, [seasonId]);

  useEffect(() => {
    load().catch(() => setError("Failed to load season"));
  }, [load]);

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
