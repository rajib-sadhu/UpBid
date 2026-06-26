import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { incrementTiersSchema } from "shared";
import type { IncrementTiersInput, AuctionDetail } from "shared";
import { apiFetch, ApiClientError } from "../../../api/client.js";
import { Button } from "../../../components/ui/button.js";
import { Input } from "../../../components/ui/input.js";
import { Card } from "../../../components/ui/card.js";

interface Props {
  auctionId: string;
  detail: AuctionDetail;
  disabled: boolean;
  onChanged: () => void;
}

export function TiersCard({ auctionId, detail, disabled, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const initial =
    detail.incrementTiers.length > 0
      ? detail.incrementTiers.map((t) => ({ fromAmount: t.fromAmount, increment: t.increment }))
      : [{ fromAmount: "0", increment: "0.25" }];

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<IncrementTiersInput>({
    resolver: zodResolver(incrementTiersSchema),
    values: { tiers: initial },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "tiers" });

  async function onSubmit(values: IncrementTiersInput) {
    setError(null);
    setSaved(false);
    try {
      await apiFetch(`/api/auctions/${auctionId}/increment-tiers`, {
        method: "PUT",
        body: JSON.stringify(values),
      });
      setSaved(true);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to save tiers");
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-medium">Bid increment tiers</h2>
      <p className="mb-4 text-xs text-slate-500">
        From a price threshold (cr), bids step up by the increment (cr).
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={f.id} className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-slate-400">From ≥</label>
                <Input type="text" disabled={disabled} {...register(`tiers.${i}.fromAmount`)} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-400">Increment</label>
                <Input type="text" disabled={disabled} {...register(`tiers.${i}.increment`)} />
              </div>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => remove(i)}
                  disabled={fields.length <= 1}
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
        </div>
        {errors.tiers?.message && <p className="text-xs text-red-400">{errors.tiers.message}</p>}
        {errors.tiers?.root?.message && (
          <p className="text-xs text-red-400">{errors.tiers.root.message}</p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {saved && <p className="text-sm text-emerald-400">Tiers saved</p>}
        {!disabled && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => append({ fromAmount: "0", increment: "0.25" })}
            >
              + Add tier
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save tiers"}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
