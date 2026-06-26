import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateAuctionSchema, BIDDING_MODES } from "shared";
import type { UpdateAuctionInput, AuctionDetail, Team, Lot, Formation, PublicUser } from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Select } from "../../components/ui/select.js";
import { Card } from "../../components/ui/card.js";
import { RulesCard } from "./sections/RulesCard.js";
import { TiersCard } from "./sections/TiersCard.js";
import { LineupRulesCard } from "./sections/LineupRulesCard.js";
import { TeamsCard } from "./sections/TeamsCard.js";
import { FormationsCard } from "./sections/FormationsCard.js";
import { LotsCard } from "./sections/LotsCard.js";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-500/15 text-slate-300",
  LIVE: "bg-emerald-500/15 text-emerald-400",
  PAUSED: "bg-amber-500/15 text-amber-400",
  RE_AUCTION: "bg-indigo-500/15 text-indigo-300",
  ASSIGNMENT: "bg-indigo-500/15 text-indigo-300",
  COMPLETED: "bg-slate-700/40 text-slate-400",
};

export function AuctionSetupPage() {
  const { id = "" } = useParams();
  const [detail, setDetail] = useState<AuctionDetail | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [franchises, setFranchises] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [goLiveMsg, setGoLiveMsg] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [d, t, l, f, users] = await Promise.all([
      apiFetch<AuctionDetail>(`/api/auctions/${id}`),
      apiFetch<Team[]>(`/api/auctions/${id}/teams`),
      apiFetch<Lot[]>(`/api/auctions/${id}/lots`),
      apiFetch<Formation[]>(`/api/formations`),
      apiFetch<PublicUser[]>(`/api/users`),
    ]);
    setDetail(d);
    setTeams(t);
    setLots(l);
    setFormations(f);
    setFranchises(users.filter((u) => u.role === "FRANCHISE"));
  }, [id]);

  useEffect(() => {
    loadAll().catch(() => setError("Failed to load auction"));
  }, [loadAll]);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<UpdateAuctionInput>({
    resolver: zodResolver(updateAuctionSchema),
    values: { name: detail?.name ?? "", biddingMode: detail?.biddingMode ?? "FRANCHISE" },
  });

  async function saveHeader(values: UpdateAuctionInput) {
    setError(null);
    try {
      await apiFetch(`/api/auctions/${id}`, { method: "PATCH", body: JSON.stringify(values) });
      await loadAll();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to update auction");
    }
  }

  async function goLive() {
    setGoLiveMsg(null);
    setError(null);
    try {
      await apiFetch(`/api/auctions/${id}/go-live`, { method: "POST" });
      setGoLiveMsg("Auction is now LIVE.");
      await loadAll();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Could not go live");
    }
  }

  if (!detail) {
    return <p className="text-slate-400">{error ?? "Loading…"}</p>;
  }

  const disabled = detail.status !== "DRAFT";

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/seasons/${detail.seasonId}`} className="text-sm text-indigo-400 hover:text-indigo-300">
          ← Season
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{detail.name}</h1>
          <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[detail.status] ?? ""}`}>
            {detail.status}
          </span>
          <span className="text-sm text-slate-500">{detail.sport}</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {goLiveMsg && <p className="text-sm text-emerald-400">{goLiveMsg}</p>}

      {/* Header: name + bidding mode + go live */}
      <Card>
        <form
          onSubmit={handleSubmit(saveHeader)}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">Name</label>
            <Input disabled={disabled} {...register("name")} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">Bidding mode</label>
            <Select disabled={disabled} {...register("biddingMode")}>
              {BIDDING_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          {!disabled && (
            <Button type="submit" variant="outline" disabled={isSubmitting}>
              Save
            </Button>
          )}
          <div className="ml-auto">
            {detail.status === "DRAFT" ? (
              <Button type="button" onClick={() => void goLive()}>
                Go live →
              </Button>
            ) : (
              detail.status !== "COMPLETED" && (
                <Link to={`/auctions/${id}/live`}>
                  <Button type="button">Open live auction →</Button>
                </Link>
              )
            )}
          </div>
        </form>
        {disabled && (
          <p className="mt-3 text-xs text-slate-500">
            Configuration is locked because the auction is {detail.status}.
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <RulesCard auctionId={id} detail={detail} disabled={disabled} onChanged={loadAll} />
        <LineupRulesCard auctionId={id} detail={detail} disabled={disabled} onChanged={loadAll} />
        <TiersCard auctionId={id} detail={detail} disabled={disabled} onChanged={loadAll} />
        {detail.sport === "FOOTBALL" && (
          <FormationsCard
            auctionId={id}
            formations={formations}
            selectedIds={detail.allowedFormationIds}
            disabled={disabled}
            onChanged={loadAll}
          />
        )}
      </div>

      <TeamsCard
        auctionId={id}
        teams={teams}
        franchises={franchises}
        disabled={disabled}
        onChanged={loadAll}
      />

      <LotsCard auctionId={id} lots={lots} disabled={disabled} onChanged={loadAll} />
    </div>
  );
}
