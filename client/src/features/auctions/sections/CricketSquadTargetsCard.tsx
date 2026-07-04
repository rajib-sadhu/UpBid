import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cricketSquadTargetsSchema } from "shared";
import type { CricketSquadTargetsInput, AuctionDetail } from "shared";
import { apiFetch, ApiClientError } from "../../../api/client.js";
import { Button } from "../../../components/ui/button.js";
import { Input } from "../../../components/ui/input.js";
import { Label } from "../../../components/ui/label.js";
import { Card } from "../../../components/ui/card.js";

interface Props {
  auctionId: string;
  detail: AuctionDetail;
  disabled: boolean;
  onChanged: () => void;
}

const FIELDS: { name: keyof CricketSquadTargetsInput; label: string }[] = [
  { name: "minWicketkeepers", label: "Min wicketkeepers" },
  { name: "minBatsmen", label: "Min batsmen" },
  { name: "minOpeners", label: "Min openers (of batsmen)" },
  { name: "minPaceBowlers", label: "Min pace bowlers" },
  { name: "minSpinners", label: "Min spinners" },
  { name: "minAllRounders", label: "Min all-rounders" },
];

/** Auto-pilot squad-composition targets (cricket only). */
export function CricketSquadTargetsCard({ auctionId, detail, disabled, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const t = detail.cricketSquadTargets;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CricketSquadTargetsInput>({
    resolver: zodResolver(cricketSquadTargetsSchema),
    values: {
      minWicketkeepers: t?.minWicketkeepers ?? 1,
      minBatsmen: t?.minBatsmen ?? 3,
      minOpeners: t?.minOpeners ?? 2,
      minPaceBowlers: t?.minPaceBowlers ?? 2,
      minSpinners: t?.minSpinners ?? 1,
      minAllRounders: t?.minAllRounders ?? 1,
    },
  });

  async function onSubmit(values: CricketSquadTargetsInput) {
    setError(null);
    setSaved(false);
    try {
      await apiFetch(`/api/auctions/${auctionId}/cricket-squad-targets`, {
        method: "PUT",
        body: JSON.stringify(values),
      });
      setSaved(true);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to save squad targets");
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-medium">Auto-pilot squad targets</h2>
      <p className="mb-4 text-xs text-slate-500">
        Per-team composition the Auto Auction aims for (best-effort if the player pool falls short).
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.name} className="space-y-1">
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input id={f.name} type="number" disabled={disabled} {...register(f.name)} />
              {errors[f.name] && <p className="text-xs text-red-400">{errors[f.name]?.message}</p>}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {saved && <p className="text-sm text-emerald-400">Squad targets saved</p>}
        {!disabled && (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save squad targets"}
          </Button>
        )}
      </form>
    </Card>
  );
}
