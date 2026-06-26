import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createLeagueSchema, SPORTS } from "shared";
import type { CreateLeagueInput, League } from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Select } from "../../components/ui/select.js";
import { Label } from "../../components/ui/label.js";
import { Card } from "../../components/ui/card.js";

export function ViewLeaguesPage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateLeagueInput>({
    resolver: zodResolver(createLeagueSchema),
    defaultValues: { name: "", sport: "CRICKET" },
  });

  async function load() {
    setLeagues(await apiFetch<League[]>("/api/leagues"));
  }

  useEffect(() => {
    load().catch(() => setServerError("Failed to load leagues"));
  }, []);

  async function onSubmit(values: CreateLeagueInput) {
    setServerError(null);
    try {
      await apiFetch("/api/leagues", { method: "POST", body: JSON.stringify(values) });
      reset();
      await load();
    } catch (e) {
      setServerError(e instanceof ApiClientError ? e.message : "Failed to create league");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Leagues</h1>

      <div className="grid gap-6 md:grid-cols-[20rem_1fr]">
        <Card className="h-fit">
          <h2 className="mb-4 font-medium">Create league</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="sport">Sport</Label>
              <Select id="sport" {...register("sport")}>
                {SPORTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            {serverError && <p className="text-sm text-red-400">{serverError}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create league"}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 font-medium">Your leagues ({leagues.length})</h2>
          <div className="space-y-2">
            {leagues.map((l) => (
              <Link
                key={l.id}
                to={`/leagues/${l.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-800 px-4 py-3 hover:border-indigo-500 hover:bg-slate-800/40"
              >
                <div>
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-slate-400">
                    {l.sport} · {l.seasonCount ?? 0} season{l.seasonCount === 1 ? "" : "s"}
                  </div>
                </div>
                <span className="text-sm text-indigo-400">Open →</span>
              </Link>
            ))}
            {leagues.length === 0 && (
              <p className="py-4 text-center text-slate-500">No leagues yet.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
