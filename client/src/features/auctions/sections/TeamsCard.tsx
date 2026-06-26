import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTeamSchema } from "shared";
import type { CreateTeamInput, Team, PublicUser } from "shared";
import { apiFetch, ApiClientError } from "../../../api/client.js";
import { Button } from "../../../components/ui/button.js";
import { Input } from "../../../components/ui/input.js";
import { Select } from "../../../components/ui/select.js";
import { Label } from "../../../components/ui/label.js";
import { Card } from "../../../components/ui/card.js";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface Props {
  auctionId: string;
  teams: Team[];
  franchises: PublicUser[];
  disabled: boolean;
  onChanged: () => void;
}

export function TeamsCard({ auctionId, teams, franchises, disabled, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTeamInput>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: { ownerUserId: "", name: "", shortName: "" },
  });

  const assigned = new Set(teams.map((t) => t.ownerUserId));
  const available = franchises.filter((f) => !assigned.has(f.id));

  async function onSubmit(values: CreateTeamInput) {
    setError(null);
    try {
      await apiFetch(`/api/auctions/${auctionId}/teams`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      reset();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to add team");
    }
  }

  async function uploadLogo(teamId: string, file: File) {
    setError(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      await apiFetch(`/api/auctions/${auctionId}/teams/${teamId}/logo`, { method: "POST", body: fd });
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Logo upload failed");
    }
  }

  async function remove(teamId: string) {
    setError(null);
    try {
      await apiFetch(`/api/auctions/${auctionId}/teams/${teamId}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to remove team");
    }
  }

  return (
    <Card className="min-w-0">
      <h2 className="mb-4 font-medium">Teams ({teams.length})</h2>

      {!disabled && (
        <form onSubmit={handleSubmit(onSubmit)} className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="ownerUserId">Franchise owner</Label>
            <Select id="ownerUserId" {...register("ownerUserId")}>
              <option value="">Select…</option>
              {available.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.email})
                </option>
              ))}
            </Select>
            {errors.ownerUserId && (
              <p className="text-xs text-red-400">{errors.ownerUserId.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="name">Team name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="shortName">Short</Label>
            <Input id="shortName" {...register("shortName")} />
          </div>
          <Button type="submit" disabled={isSubmitting || available.length === 0}>
            Add team
          </Button>
        </form>
      )}
      {available.length === 0 && !disabled && (
        <p className="mb-3 text-xs text-slate-500">
          All your franchises are assigned. Create more under Users.
        </p>
      )}

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <div className="space-y-2">
        {teams.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-lg border border-slate-800 px-3 py-2"
          >
            <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded bg-slate-800 text-[9px] text-slate-500 hover:ring-2 hover:ring-indigo-400">
              {t.logoUrl ? (
                <img src={`${API_BASE}${t.logoUrl}`} alt={t.name} className="h-full w-full object-cover" />
              ) : (
                "logo"
              )}
              {!disabled && (
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadLogo(t.id, file);
                    e.target.value = "";
                  }}
                />
              )}
            </label>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {t.name} {t.shortName && <span className="text-slate-500">({t.shortName})</span>}
              </div>
              <div className="truncate text-xs text-slate-400">{t.ownerEmail}</div>
            </div>
            {!disabled && (
              <Button variant="ghost" onClick={() => void remove(t.id)}>
                Remove
              </Button>
            )}
          </div>
        ))}
        {teams.length === 0 && <p className="py-3 text-center text-slate-500">No teams yet.</p>}
      </div>
    </Card>
  );
}
