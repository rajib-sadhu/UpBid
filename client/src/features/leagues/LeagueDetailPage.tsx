import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSeasonSchema, createFranchiseSchema } from "shared";
import type {
  CreateSeasonInput,
  CreateFranchiseInput,
  League,
  Season,
  Franchise,
  PublicUser,
  LeaguePlayer,
  LeaguePlayerSortField,
  Paginated,
} from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Select } from "../../components/ui/select.js";
import { Label } from "../../components/ui/label.js";
import { Card } from "../../components/ui/card.js";
import { ColorSwatch } from "../../components/ui/color-swatch.js";

const PAGE_SIZE = 10;
const API_BASE = import.meta.env.VITE_API_URL ?? "";
const DEFAULT_COLOR = "#1E40AF";
const DEFAULT_SECONDARY = "#FFFFFF";

export function LeagueDetailPage() {
  const { id = "" } = useParams();
  const [league, setLeague] = useState<League | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [franchiseUsers, setFranchiseUsers] = useState<PublicUser[]>([]);
  const [editingFranchiseId, setEditingFranchiseId] = useState<string | null>(null);
  const [players, setPlayers] = useState<LeaguePlayer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [sortField, setSortField] = useState<LeaguePlayerSortField>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateSeasonInput>({
    resolver: zodResolver(createSeasonSchema),
    defaultValues: { name: "", startDate: "", endDate: "" },
  });

  const fForm = useForm<CreateFranchiseInput>({
    resolver: zodResolver(createFranchiseSchema),
    defaultValues: {
      name: "",
      shortName: "",
      primaryColor: DEFAULT_COLOR,
      secondaryColor: "",
      ownerUserId: "",
    },
  });
  const secondaryColor = fForm.watch("secondaryColor");

  const loadLeague = useCallback(async () => {
    const [lg, ss, fr, users] = await Promise.all([
      apiFetch<League>(`/api/leagues/${id}`),
      apiFetch<Season[]>(`/api/leagues/${id}/seasons`),
      apiFetch<Franchise[]>(`/api/leagues/${id}/franchises`),
      apiFetch<PublicUser[]>(`/api/users`),
    ]);
    setLeague(lg);
    setSeasons(ss);
    setFranchises(fr);
    setFranchiseUsers(users.filter((u) => u.role === "FRANCHISE"));
  }, [id]);

  const loadPlayers = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sort: sortField,
      dir: sortDir,
    });
    if (q.trim()) params.set("q", q.trim());
    const res = await apiFetch<Paginated<LeaguePlayer>>(
      `/api/leagues/${id}/players?${params.toString()}`,
    );
    setPlayers(res.data);
    setTotal(res.total);
  }, [id, page, q, sortField, sortDir]);

  function toggleSort(field: LeaguePlayerSortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  }

  useEffect(() => {
    loadLeague().catch(() => setError("Failed to load league"));
  }, [loadLeague]);

  useEffect(() => {
    loadPlayers().catch(() => setError("Failed to load players"));
  }, [loadPlayers]);

  async function onCreateSeason(values: CreateSeasonInput) {
    setError(null);
    try {
      await apiFetch(`/api/leagues/${id}/seasons`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      reset();
      await loadLeague();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to create season");
    }
  }

  function startEditFranchise(f: Franchise) {
    setEditingFranchiseId(f.id);
    fForm.reset({
      name: f.name,
      shortName: f.shortName,
      primaryColor: f.primaryColor,
      secondaryColor: f.secondaryColor ?? "",
      ownerUserId: f.ownerUserId ?? "",
    });
  }

  function cancelEditFranchise() {
    setEditingFranchiseId(null);
    fForm.reset({
      name: "",
      shortName: "",
      primaryColor: DEFAULT_COLOR,
      secondaryColor: "",
      ownerUserId: "",
    });
  }

  async function onSubmitFranchise(values: CreateFranchiseInput) {
    setError(null);
    try {
      const path = editingFranchiseId
        ? `/api/leagues/${id}/franchises/${editingFranchiseId}`
        : `/api/leagues/${id}/franchises`;
      await apiFetch(path, {
        method: editingFranchiseId ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });
      cancelEditFranchise();
      await loadLeague();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to save team");
    }
  }

  async function deleteFranchise(franchiseId: string) {
    setError(null);
    try {
      await apiFetch(`/api/leagues/${id}/franchises/${franchiseId}`, { method: "DELETE" });
      if (editingFranchiseId === franchiseId) cancelEditFranchise();
      await loadLeague();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to delete team");
    }
  }

  async function uploadFranchiseLogo(franchiseId: string, file: File) {
    setError(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      await apiFetch(`/api/leagues/${id}/franchises/${franchiseId}/logo`, {
        method: "POST",
        body: fd,
      });
      await loadLeague();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Logo upload failed");
    }
  }

  async function toggleBan(player: LeaguePlayer) {
    setError(null);
    try {
      await apiFetch(`/api/leagues/${id}/players/${player.id}/ban`, {
        method: "PUT",
        body: JSON.stringify({ banned: !player.banned }),
      });
      await loadPlayers();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to update ban status");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <Link to="/leagues" className="text-sm text-indigo-400 hover:text-indigo-300">
          ← Leagues
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">
          {league?.name ?? "League"}
          {league && <span className="ml-2 text-slate-500">({league.shortName})</span>}
        </h1>
        {league && <p className="text-slate-400">{league.sport}</p>}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Franchises — league-level team identities reused across seasons/auctions */}
      <Card>
        <h2 className="mb-1 font-medium">Teams / franchises ({franchises.length})</h2>
        <p className="mb-4 text-xs text-slate-500">
          Define each team once here; pick which ones play a given season on the season page.
        </p>
        <form
          onSubmit={fForm.handleSubmit(onSubmitFranchise)}
          className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_6rem_auto_1fr_auto] sm:items-end"
        >
          <div className="space-y-1">
            <Label htmlFor="fname">Team name</Label>
            <Input id="fname" {...fForm.register("name")} />
            {fForm.formState.errors.name && (
              <p className="text-xs text-red-400">{fForm.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="fshort">Short</Label>
            <Input id="fshort" maxLength={3} className="uppercase" {...fForm.register("shortName")} />
            {fForm.formState.errors.shortName && (
              <p className="text-xs text-red-400">{fForm.formState.errors.shortName.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="fcolor">Colors</Label>
            <div className="flex items-center gap-1.5">
              <Input
                id="fcolor"
                type="color"
                className="h-9 w-10 p-1"
                title="Primary color"
                {...fForm.register("primaryColor")}
              />
              {secondaryColor ? (
                <>
                  <Input
                    type="color"
                    className="h-9 w-10 p-1"
                    title="Secondary color"
                    {...fForm.register("secondaryColor")}
                  />
                  <button
                    type="button"
                    className="px-1 text-lg leading-none text-slate-500 hover:text-slate-300"
                    title="Remove secondary color"
                    onClick={() => fForm.setValue("secondaryColor", "")}
                  >
                    ×
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="whitespace-nowrap text-xs text-indigo-400 hover:text-indigo-300"
                  onClick={() => fForm.setValue("secondaryColor", DEFAULT_SECONDARY)}
                >
                  + 2nd
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fowner">Owner (optional)</Label>
            <Select id="fowner" {...fForm.register("ownerUserId")}>
              <option value="">No owner</option>
              {franchiseUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={fForm.formState.isSubmitting}>
              {editingFranchiseId ? "Save" : "Add team"}
            </Button>
            {editingFranchiseId && (
              <Button type="button" variant="outline" onClick={cancelEditFranchise}>
                Cancel
              </Button>
            )}
          </div>
        </form>
        <div className="space-y-2">
          {franchises.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-lg border border-slate-800 px-3 py-2"
            >
              <ColorSwatch primary={f.primaryColor} secondary={f.secondaryColor} />
              <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded bg-slate-800 text-[9px] text-slate-500 hover:ring-2 hover:ring-indigo-400">
                {f.logoUrl ? (
                  <img
                    src={`${API_BASE}${f.logoUrl}`}
                    alt={f.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "logo"
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFranchiseLogo(f.id, file);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {f.name} <span className="text-slate-500">({f.shortName})</span>
                </div>
                <div className="truncate text-xs text-slate-400">{f.ownerName ?? "No owner"}</div>
              </div>
              <Button variant="outline" onClick={() => startEditFranchise(f)}>
                Edit
              </Button>
              <Button variant="ghost" onClick={() => void deleteFranchise(f.id)}>
                Remove
              </Button>
            </div>
          ))}
          {franchises.length === 0 && (
            <p className="py-3 text-center text-slate-500">No teams yet.</p>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Seasons */}
        <Card>
          <h2 className="mb-4 font-medium">Seasons ({seasons.length})</h2>
          <form onSubmit={handleSubmit(onCreateSeason)} className="mb-4 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name">Season name</Label>
              <Input id="name" placeholder="e.g. 2026" {...register("name")} />
              {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="startDate">Start</Label>
                <Input id="startDate" type="date" {...register("startDate")} />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="endDate">End</Label>
                <Input id="endDate" type="date" {...register("endDate")} />
              </div>
            </div>
            {errors.endDate && <p className="text-xs text-red-400">{errors.endDate.message}</p>}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding…" : "Add season"}
            </Button>
          </form>
          <div className="space-y-2">
            {seasons.map((s) => (
              <Link
                key={s.id}
                to={`/seasons/${s.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-800 px-4 py-2 text-sm hover:border-indigo-500 hover:bg-slate-800/40"
              >
                <span className="font-medium">
                  {s.name}{" "}
                  <span className="text-xs text-slate-500">
                    · {s.auctionCount ?? 0} auction{s.auctionCount === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="text-slate-400">
                  {s.startDate ?? "—"} → {s.endDate ?? "—"}
                </span>
              </Link>
            ))}
            {seasons.length === 0 && (
              <p className="py-3 text-center text-slate-500">No seasons yet.</p>
            )}
          </div>
        </Card>

        {/* Per-league player bans */}
        <Card className="min-w-0">
          <h2 className="mb-1 font-medium">Player availability</h2>
          <p className="mb-4 text-xs text-slate-500">
            Banned players are excluded when building this league's auction lots.
          </p>
          <Input
            placeholder="Search players…"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            className="mb-4 max-w-xs"
          />
          <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-800">
                {(
                  [
                    ["name", "Name"],
                    ["banned", "Status"],
                  ] as const
                ).map(([field, label]) => (
                  <th key={field} className="pb-2 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(field)}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                    >
                      {label}
                      <span className="text-[10px]">
                        {sortField === field ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </th>
                ))}
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/50">
                  <td className="py-2 font-medium">{p.name}</td>
                  <td className="py-2">
                    {p.banned ? (
                      <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                        Banned
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                        Available
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="outline" onClick={() => void toggleBan(p)}>
                      {p.banned ? "Unban" : "Ban"}
                    </Button>
                  </td>
                </tr>
              ))}
              {players.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-slate-500">
                    No players for this sport yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
            <span>
              Page {page} of {totalPages} · {total} players
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
