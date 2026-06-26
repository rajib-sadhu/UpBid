import { useEffect, useState } from "react";
import type { Formation } from "shared";
import { apiFetch, ApiClientError } from "../../../api/client.js";
import { Button } from "../../../components/ui/button.js";
import { Card } from "../../../components/ui/card.js";

interface Props {
  auctionId: string;
  formations: Formation[];
  selectedIds: string[];
  disabled: boolean;
  onChanged: () => void;
}

export function FormationsCard({ auctionId, formations, selectedIds, disabled, onChanged }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSelected(new Set(selectedIds));
  }, [selectedIds]);

  function toggle(id: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setError(null);
    setSaved(false);
    try {
      await apiFetch(`/api/auctions/${auctionId}/formations`, {
        method: "PUT",
        body: JSON.stringify({ formationIds: [...selected] }),
      });
      setSaved(true);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to save formations");
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-medium">Allowed formations</h2>
      <p className="mb-4 text-xs text-slate-500">Formations franchises may pick for their lineup.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {formations.map((f) => {
          const on = selected.has(f.id);
          return (
            <button
              key={f.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(f.id)}
              className={`rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-60 ${
                on ? "border-indigo-500 bg-indigo-500/10" : "border-slate-800 hover:border-slate-600"
              }`}
            >
              <div className="font-medium">{f.name}</div>
              <div className="text-xs text-slate-500">
                GK {f.numGK} · DEF {f.numDef} · MID {f.numMid} · FWD {f.numFwd}
              </div>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {saved && <p className="mt-3 text-sm text-emerald-400">Formations saved</p>}
      {!disabled && (
        <Button className="mt-4" onClick={save}>
          Save formations
        </Button>
      )}
    </Card>
  );
}
