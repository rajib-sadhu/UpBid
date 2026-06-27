import { useCallback, useEffect, useState } from "react";
import type { Lot, Player, Paginated } from "shared";
import { apiFetch, ApiClientError } from "../../../api/client.js";
import { Button } from "../../../components/ui/button.js";
import { Input } from "../../../components/ui/input.js";
import { Card } from "../../../components/ui/card.js";

const PAGE_SIZE = 8;
const FALLBACK_BASE_PRICE = "2";

interface Props {
  auctionId: string;
  lots: Lot[];
  defaultBasePrice?: string;
  disabled: boolean;
  onChanged: () => void;
}

export function LotsCard({ auctionId, lots, defaultBasePrice, disabled, onChanged }: Props) {
  const basePrice = defaultBasePrice || FALLBACK_BASE_PRICE;
  const [available, setAvailable] = useState<Player[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [overseas, setOverseas] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [addingAll, setAddingAll] = useState(false);

  const loadAvailable = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (q.trim()) params.set("q", q.trim());
    const res = await apiFetch<Paginated<Player>>(
      `/api/auctions/${auctionId}/available-players?${params.toString()}`,
    );
    setAvailable(res.data);
    setTotal(res.total);
  }, [auctionId, page, q]);

  useEffect(() => {
    if (!disabled) loadAvailable().catch(() => setError("Failed to load players"));
  }, [loadAvailable, disabled, lots.length]);

  async function addLot(playerId: string) {
    setError(null);
    try {
      await apiFetch(`/api/auctions/${auctionId}/lots`, {
        method: "POST",
        body: JSON.stringify({
          lots: [{ playerId, basePrice: prices[playerId] ?? basePrice, isOverseas: overseas[playerId] ?? false }],
        }),
      });
      onChanged();
      await loadAvailable();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to add lot");
    }
  }

  async function removeLot(lotId: string) {
    setError(null);
    try {
      await apiFetch(`/api/auctions/${auctionId}/lots/${lotId}`, { method: "DELETE" });
      onChanged();
      await loadAvailable();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to remove lot");
    }
  }

  async function addAllToAuction() {
    setError(null);
    setAddingAll(true);
    try {
      const allPlayers: Player[] = [];
      let pg = 1;
      let hasMore = true;
      while (hasMore) {
        const params = new URLSearchParams({ page: String(pg), pageSize: "100" });
        const res = await apiFetch<Paginated<Player>>(
          `/api/auctions/${auctionId}/available-players?${params.toString()}`,
        );
        allPlayers.push(...res.data);
        hasMore = allPlayers.length < res.total;
        pg++;
      }
      if (allPlayers.length === 0) return;
      await apiFetch(`/api/auctions/${auctionId}/lots`, {
        method: "POST",
        body: JSON.stringify({
          lots: allPlayers.map((p) => ({
            playerId: p.id,
            basePrice: basePrice,
            isOverseas: false,
          })),
        }),
      });
      onChanged();
      await loadAvailable();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to add all players");
    } finally {
      setAddingAll(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card className="min-w-0">
      <h2 className="mb-4 font-medium">Lot list ({lots.length})</h2>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Current lots */}
        <div className="min-w-0">
          <h3 className="mb-2 text-sm font-medium text-slate-300">In the auction</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[20rem] text-left text-sm">
              <thead className="text-slate-400">
                <tr className="border-b border-slate-800">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Player</th>
                  <th className="pb-2 font-medium">Base</th>
                  <th className="pb-2 font-medium">O/S</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l, i) => (
                  <tr key={l.id} className="border-b border-slate-800/50">
                    <td className="py-2 text-slate-500">{i + 1}</td>
                    <td className="py-2 font-medium">{l.playerName}</td>
                    <td className="py-2 text-slate-400">{l.basePrice}</td>
                    <td className="py-2 text-slate-400">{l.isOverseas ? "✓" : "—"}</td>
                    <td className="py-2 text-right">
                      {!disabled && (
                        <Button variant="ghost" onClick={() => void removeLot(l.id)}>
                          ✕
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {lots.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-center text-slate-500">
                      No lots yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Available players to add */}
        {!disabled && (
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-300">Add players</h3>
              {total > 0 && (
                <Button
                  variant="outline"
                  disabled={addingAll}
                  onClick={() => void addAllToAuction()}
                >
                  {addingAll ? "Adding…" : `Add all to auction (${total})`}
                </Button>
              )}
            </div>
            <Input
              placeholder="Search players…"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              className="mb-3"
            />
            <div className="space-y-2">
              {available.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded border border-slate-800 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <Input
                    type="text"
                    value={prices[p.id] ?? basePrice}
                    onChange={(e) => setPrices((m) => ({ ...m, [p.id]: e.target.value }))}
                    className="w-16 px-2 py-1"
                    title="Base price (cr)"
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-400" title="Overseas">
                    <input
                      type="checkbox"
                      className="accent-indigo-500"
                      checked={overseas[p.id] ?? false}
                      onChange={(e) => setOverseas((m) => ({ ...m, [p.id]: e.target.checked }))}
                    />
                    O/S
                  </label>
                  <Button onClick={() => void addLot(p.id)}>Add lot</Button>
                </div>
              ))}
              {available.length === 0 && (
                <p className="py-3 text-center text-slate-500">No more players available.</p>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-slate-400">
              <span>
                Page {page}/{totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
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
          </div>
        )}
      </div>
    </Card>
  );
}
