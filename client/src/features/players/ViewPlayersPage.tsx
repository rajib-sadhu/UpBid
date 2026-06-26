import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createPlayerSchema, SPORTS, FOOTBALL_POSITIONS } from "shared";
import type { CreatePlayerInput, Player, Paginated } from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Select } from "../../components/ui/select.js";
import { Label } from "../../components/ui/label.js";
import { Card } from "../../components/ui/card.js";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const PAGE_SIZE = 10;

export function ViewPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [sportFilter, setSportFilter] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreatePlayerInput>({
    resolver: zodResolver(createPlayerSchema),
    defaultValues: {
      name: "",
      sport: "CRICKET",
      role: "",
      nationality: "",
      dateOfBirth: "",
      externalRef: "",
      footballPosition: "",
    },
  });
  const sport = watch("sport");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (q.trim()) params.set("q", q.trim());
    if (sportFilter) params.set("sport", sportFilter);
    const res = await apiFetch<Paginated<Player>>(`/api/players?${params.toString()}`);
    setPlayers(res.data);
    setTotal(res.total);
  }, [page, q, sportFilter]);

  useEffect(() => {
    load().catch(() => setServerError("Failed to load players"));
  }, [load]);

  async function onSubmit(values: CreatePlayerInput) {
    setServerError(null);
    setSuccess(null);
    try {
      await apiFetch("/api/players", { method: "POST", body: JSON.stringify(values) });
      reset();
      setPage(1);
      await load();
      setSuccess(`Player "${values.name}" added`);
    } catch (e) {
      setServerError(e instanceof ApiClientError ? e.message : "Failed to add player");
    }
  }

  async function uploadPhoto(playerId: string, file: File) {
    setServerError(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      await apiFetch(`/api/players/${playerId}/photo`, { method: "POST", body: fd });
      await load();
    } catch (e) {
      setServerError(e instanceof ApiClientError ? e.message : "Photo upload failed");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Players</h1>

      <div className="grid gap-6 md:grid-cols-[20rem_1fr]">
        <Card className="h-fit">
          <h2 className="mb-4 font-medium">Add player</h2>
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
            {sport === "FOOTBALL" && (
              <div className="space-y-1">
                <Label htmlFor="footballPosition">Position</Label>
                <Select id="footballPosition" {...register("footballPosition")}>
                  <option value="">—</option>
                  {FOOTBALL_POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
                {errors.footballPosition && (
                  <p className="text-xs text-red-400">{errors.footballPosition.message}</p>
                )}
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="role">Role</Label>
              <Input id="role" placeholder="e.g. Batter, Striker" {...register("role")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nationality">Nationality</Label>
              <Input id="nationality" {...register("nationality")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <Input id="dateOfBirth" type="date" {...register("dateOfBirth")} />
              {errors.dateOfBirth && (
                <p className="text-xs text-red-400">{errors.dateOfBirth.message}</p>
              )}
            </div>
            {serverError && <p className="text-sm text-red-400">{serverError}</p>}
            {success && <p className="text-sm text-emerald-400">{success}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Adding…" : "Add player"}
            </Button>
          </form>
        </Card>

        <Card className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search by name…"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              className="max-w-xs"
            />
            <Select
              value={sportFilter}
              onChange={(e) => {
                setPage(1);
                setSportFilter(e.target.value);
              }}
              className="max-w-[10rem]"
            >
              <option value="">All sports</option>
              {SPORTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <span className="ml-auto text-sm text-slate-400">{total} total</span>
          </div>

          <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-800">
                <th className="pb-2 font-medium">Photo</th>
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Sport</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Nationality</th>
                <th className="pb-2 font-medium">Pos</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/50">
                  <td className="py-2">
                    <label className="flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-slate-800 text-[10px] text-slate-500 hover:ring-2 hover:ring-indigo-400">
                      {p.photoUrl ? (
                        <img
                          src={`${API_BASE}${p.photoUrl}`}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        "Add"
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadPhoto(p.id, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </td>
                  <td className="py-2 font-medium">{p.name}</td>
                  <td className="py-2 text-slate-400">{p.sport}</td>
                  <td className="py-2 text-slate-400">{p.role ?? "—"}</td>
                  <td className="py-2 text-slate-400">{p.nationality ?? "—"}</td>
                  <td className="py-2 text-slate-400">{p.footballPosition ?? "—"}</td>
                </tr>
              ))}
              {players.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    No players found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((n) => Math.max(1, n - 1))}
              >
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
        </Card>
      </div>
    </div>
  );
}
