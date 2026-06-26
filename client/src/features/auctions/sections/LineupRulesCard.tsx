import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { lineupRulesSchema } from "shared";
import type { LineupRulesInput, AuctionDetail } from "shared";
import { apiFetch, ApiClientError } from "../../../api/client.js";
import { Button } from "../../../components/ui/button.js";
import { Input } from "../../../components/ui/input.js";
import { Label } from "../../../components/ui/label.js";
import { Card } from "../../../components/ui/card.js";
import { Checkbox } from "../../../components/ui/checkbox.js";

interface Props {
  auctionId: string;
  detail: AuctionDetail;
  disabled: boolean;
  onChanged: () => void;
}

export function LineupRulesCard({ auctionId, detail, disabled, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const l = detail.lineupRules;
  const isCricket = detail.sport === "CRICKET";
  const isFootball = detail.sport === "FOOTBALL";

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LineupRulesInput>({
    resolver: zodResolver(lineupRulesSchema),
    values: {
      startingSize: l?.startingSize ?? 11,
      overseasCapEnabled: l?.overseasCapEnabled ?? false,
      maxOverseasInXI: l?.maxOverseasInXI ?? 4,
      requireWicketkeeper: l?.requireWicketkeeper ?? true,
      requireCaptain: l?.requireCaptain ?? true,
      requireViceCaptain: l?.requireViceCaptain ?? true,
      requireFirstBowler: l?.requireFirstBowler ?? true,
      requireSecondBowler: l?.requireSecondBowler ?? true,
      requireFullBattingOrder: l?.requireFullBattingOrder ?? true,
      benchSize: l?.benchSize ?? 0,
      editableAfterLockByOwner: l?.editableAfterLockByOwner ?? false,
    },
  });
  const capOn = watch("overseasCapEnabled");

  async function onSubmit(values: LineupRulesInput) {
    setError(null);
    setSaved(false);
    try {
      await apiFetch(`/api/auctions/${auctionId}/lineup-rules`, {
        method: "PUT",
        body: JSON.stringify(values),
      });
      setSaved(true);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to save lineup rules");
    }
  }

  return (
    <Card>
      <h2 className="mb-4 font-medium">Lineup rules</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="startingSize">Starting XI size</Label>
            <Input id="startingSize" type="number" disabled={disabled} {...register("startingSize")} />
            {errors.startingSize && (
              <p className="text-xs text-red-400">{errors.startingSize.message}</p>
            )}
          </div>
          {isFootball && (
            <div className="space-y-1">
              <Label htmlFor="benchSize">Bench size</Label>
              <Input id="benchSize" type="number" disabled={disabled} {...register("benchSize")} />
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-slate-800 pt-3">
          <Checkbox label="Enable overseas cap (in XI)" disabled={disabled} {...register("overseasCapEnabled")} />
          {capOn && (
            <div className="space-y-1">
              <Label htmlFor="maxOverseasInXI">Max overseas in XI</Label>
              <Input id="maxOverseasInXI" type="number" disabled={disabled} {...register("maxOverseasInXI")} />
              {errors.maxOverseasInXI && (
                <p className="text-xs text-red-400">{errors.maxOverseasInXI.message}</p>
              )}
            </div>
          )}
        </div>

        {isCricket && (
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <p className="text-xs text-slate-500">Cricket required roles</p>
            <Checkbox label="Require wicketkeeper" disabled={disabled} {...register("requireWicketkeeper")} />
            <Checkbox label="Require captain" disabled={disabled} {...register("requireCaptain")} />
            <Checkbox label="Require vice-captain" disabled={disabled} {...register("requireViceCaptain")} />
            <Checkbox label="Require 1st bowler" disabled={disabled} {...register("requireFirstBowler")} />
            <Checkbox label="Require 2nd bowler" disabled={disabled} {...register("requireSecondBowler")} />
            <Checkbox label="Require full batting order" disabled={disabled} {...register("requireFullBattingOrder")} />
          </div>
        )}

        <div className="border-t border-slate-800 pt-3">
          <Checkbox label="Owner can edit after lock" disabled={disabled} {...register("editableAfterLockByOwner")} />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {saved && <p className="text-sm text-emerald-400">Lineup rules saved</p>}
        {!disabled && (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save lineup rules"}
          </Button>
        )}
      </form>
    </Card>
  );
}
