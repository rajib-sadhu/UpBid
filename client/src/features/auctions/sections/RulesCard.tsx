import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { auctionRulesSchema } from "shared";
import type { AuctionRulesInput, AuctionDetail } from "shared";
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

export function RulesCard({ auctionId, detail, disabled, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const r = detail.rules;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuctionRulesInput>({
    resolver: zodResolver(auctionRulesSchema),
    values: {
      creditPerTeam: r?.creditPerTeam ?? "100",
      minPlayersPerTeam: r?.minPlayersPerTeam ?? 11,
      maxPlayersPerTeam: r?.maxPlayersPerTeam ?? 25,
      unsoldPrice: r?.unsoldPrice ?? "0.5",
      defaultBasePrice: r?.defaultBasePrice ?? "2",
      defaultLotDurationSec: r?.defaultLotDurationSec ?? 30,
    },
  });

  async function onSubmit(values: AuctionRulesInput) {
    setError(null);
    setSaved(false);
    try {
      await apiFetch(`/api/auctions/${auctionId}/rules`, {
        method: "PUT",
        body: JSON.stringify(values),
      });
      setSaved(true);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to save rules");
    }
  }

  const field = (name: keyof AuctionRulesInput, label: string, type = "number", step?: string) => (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} type={type} step={step} disabled={disabled} {...register(name)} />
      {errors[name] && <p className="text-xs text-red-400">{errors[name]?.message}</p>}
    </div>
  );

  return (
    <Card>
      <h2 className="mb-4 font-medium">Auction rules</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {field("creditPerTeam", "Credit per team (cr)", "text")}
          {field("unsoldPrice", "Unsold price (cr)", "text")}
          {field("defaultBasePrice", "Default base price (cr)", "text")}
          {field("minPlayersPerTeam", "Min players / team")}
          {field("maxPlayersPerTeam", "Max players / team")}
          {field("defaultLotDurationSec", "Lot timer (sec)")}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {saved && <p className="text-sm text-emerald-400">Rules saved</p>}
        {!disabled && (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save rules"}
          </Button>
        )}
      </form>
    </Card>
  );
}
