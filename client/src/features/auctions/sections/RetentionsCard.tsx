import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuctionDetail, RetentionConfig, RetentionFranchise } from "shared";
import { apiFetch, ApiClientError } from "../../../api/client.js";
import { Card } from "../../../components/ui/card.js";
import { Button } from "../../../components/ui/button.js";
import { Input } from "../../../components/ui/input.js";
import { Select } from "../../../components/ui/select.js";

interface Props {
  auctionId: string;
  detail: AuctionDetail;
  disabled: boolean;
  onChanged: () => void;
}

// Pre-auction retention (organizer-only, DRAFT-only): pick a completed auction
// of this league as the source, then per team tick the players it keeps and
// adjust their price (defaults to what they cost there). Materialized into
// squads + budgets at go-live.
export function RetentionsCard({ auctionId, detail, disabled, onChanged }: Props) {
  const [config, setConfig] = useState<RetentionConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<RetentionConfig>(`/api/auctions/${auctionId}/retentions`)
      .then((c) => {
        setConfig(c);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiClientError ? e.message : "Failed to load"));
  }, [auctionId]);

  // Reload whenever the auction detail refreshes — e.g. the organizer just
  // saved a retention cap in the rules card.
  useEffect(load, [load, detail]);

  async function changeSource(sourceAuctionId: string | null) {
    const hasRetentions = config?.franchises.some((f) => f.squad.some((p) => p.retainedPrice));
    if (
      hasRetentions &&
      !window.confirm("Changing the source auction clears every retained player. Continue?")
    ) {
      return;
    }
    setError(null);
    try {
      await apiFetch(`/api/auctions/${auctionId}/retention-source`, {
        method: "PUT",
        body: JSON.stringify({ sourceAuctionId }),
      });
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to set the source auction");
    }
  }

  if (!config) {
    return (
      <Card>
        <h2 className="mb-1 font-medium">Retained players</h2>
        <p className="py-3 text-center text-slate-500">{error ?? "Loading…"}</p>
      </Card>
    );
  }

  const retentionEnabled = config.maxRetentionsPerTeam > 0;

  return (
    <Card className="min-w-0">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Retained players</h2>
        {!disabled && retentionEnabled && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">Retain from</span>
            <Select
              aria-label="Retain from"
              value={config.sourceAuctionId ?? ""}
              onChange={(e) => void changeSource(e.target.value || null)}
              className="max-w-56"
            >
              <option value="">— none —</option>
              {config.sourceOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.seasonName})
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Each team may keep up to {config.maxRetentionsPerTeam || "—"} player(s) from a previous
        completed auction, at an editable price that is deducted from its budget at go-live.
      </p>

      {!retentionEnabled ? (
        <p className="py-3 text-center text-slate-500">
          Retention is disabled — set “Max retentions / team” in the auction rules to enable it.
        </p>
      ) : config.sourceOptions.length === 0 ? (
        <p className="py-3 text-center text-slate-500">
          No completed auction in this league to retain from yet.
        </p>
      ) : !config.sourceAuctionId ? (
        <p className="py-3 text-center text-slate-500">Pick the auction to retain from above.</p>
      ) : (
        <div className="space-y-4">
          {config.franchises.map((f) => (
            <FranchiseRetention
              key={f.franchiseId}
              auctionId={auctionId}
              franchise={f}
              cap={config.maxRetentionsPerTeam}
              disabled={disabled}
              onSaved={() => {
                load();
                onChanged();
              }}
            />
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </Card>
  );
}

function FranchiseRetention({
  auctionId,
  franchise,
  cap,
  disabled,
  onSaved,
}: {
  auctionId: string;
  franchise: RetentionFranchise;
  cap: number;
  disabled: boolean;
  onSaved: () => void;
}) {
  // Draft state: playerId → price for ticked players.
  const initial = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of franchise.squad) if (p.retainedPrice) m.set(p.playerId, p.retainedPrice);
    return m;
  }, [franchise]);
  const [picked, setPicked] = useState<Map<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setPicked(initial), [initial]);

  const dirty =
    picked.size !== initial.size ||
    [...picked].some(([id, price]) => initial.get(id) !== price);
  const total = [...picked.values()].reduce((sum, p) => sum + (Number(p) || 0), 0);

  function toggle(playerId: string, prevPrice: string) {
    setSaved(false);
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(playerId)) next.delete(playerId);
      else next.set(playerId, prevPrice);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch(`/api/auctions/${auctionId}/franchises/${franchise.franchiseId}/retentions`, {
        method: "PUT",
        body: JSON.stringify({
          items: [...picked].map(([playerId, price]) => ({ playerId, price })),
        }),
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to save retentions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: franchise.primaryColor }}
          />
          <span className="font-medium">
            {franchise.name} <span className="text-slate-500">({franchise.shortName})</span>
          </span>
        </div>
        <span className={`text-xs ${picked.size > cap ? "text-red-400" : "text-slate-400"}`}>
          {picked.size}/{cap} retained · {total} cr
        </span>
      </div>

      {franchise.squad.length === 0 ? (
        <p className="py-2 text-center text-xs text-slate-600">
          This team has no squad in the source auction.
        </p>
      ) : (
        <div className="space-y-1.5">
          {franchise.squad.map((p) => {
            const blocked = p.banned || p.inLotList;
            const checked = picked.has(p.playerId);
            return (
              <div key={p.playerId} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-indigo-500"
                  disabled={disabled || blocked || (!checked && picked.size >= cap)}
                  checked={checked}
                  onChange={() => toggle(p.playerId, p.prevPrice)}
                  aria-label={`Retain ${p.name}`}
                />
                <span className={`min-w-0 flex-1 truncate ${blocked ? "text-slate-600" : ""}`}>
                  {p.name}
                  {p.isOverseas && <span className="ml-1 text-xs text-sky-400">✈</span>}
                  {p.banned && <span className="ml-1 text-xs text-red-400">banned</span>}
                  {p.inLotList && <span className="ml-1 text-xs text-amber-400">in lot list</span>}
                </span>
                <span className="text-xs text-slate-500">was {p.prevPrice} cr</span>
                {checked && (
                  <Input
                    type="text"
                    disabled={disabled}
                    value={picked.get(p.playerId) ?? ""}
                    onChange={(e) => {
                      setSaved(false);
                      setPicked((m) => new Map(m).set(p.playerId, e.target.value));
                    }}
                    className="h-7 w-20 text-right text-xs"
                    aria-label={`Retention price for ${p.name}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {saved && <p className="mt-2 text-xs text-emerald-400">Retentions saved</p>}
      {!disabled && (
        <div className="mt-2">
          <Button variant="outline" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save retentions"}
          </Button>
        </div>
      )}
    </div>
  );
}
