import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  SPORTS,
  CRICKET_ROLE_LABELS,
  BATTING_POSITION_LABELS,
  BOWLING_STYLE_LABELS,
  ALL_ROUNDER_TYPE_LABELS,
  nationByCode,
} from "shared";
import type { Player, Paginated, PlayerSortField } from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { Button } from "../../components/ui/button.js";
import { Input } from "../../components/ui/input.js";
import { Select } from "../../components/ui/select.js";
import { Card } from "../../components/ui/card.js";
import { Modal } from "../../components/ui/modal.js";
import { Flag } from "../../components/ui/flag.js";
import { PlayerForm } from "./PlayerForm.js";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const PAGE_SIZE = 10;

// External URLs are used verbatim; our own /uploads paths are served by the API.
function photoSrc(photoUrl: string): string {
  return /^https?:\/\//i.test(photoUrl) ? photoUrl : `${API_BASE}${photoUrl}`;
}

function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

// Sort fields that only make sense within a single sport's view; switching the
// sport filter resets back to the default sort when one of these is active.
const SPORT_SPECIFIC: PlayerSortField[] = [
  "sport",
  "role",
  "cricketRole",
  "battingPosition",
  "bowlingStyle",
  "allRounderType",
  "footballPosition",
  "footballDetailPosition",
];

interface Column {
  key: PlayerSortField | null; // null = not sortable (photo, actions)
  label: string;
  render: (p: Player) => ReactNode;
}

export function ViewPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [sportFilter, setSportFilter] = useState("");
  const [sortField, setSortField] = useState<PlayerSortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<Player | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sort: sortField,
      dir: sortDir,
    });
    if (q.trim()) params.set("q", q.trim());
    if (sportFilter) params.set("sport", sportFilter);
    const res = await apiFetch<Paginated<Player>>(`/api/players?${params.toString()}`);
    setPlayers(res.data);
    setTotal(res.total);
  }, [page, q, sportFilter, sortField, sortDir]);

  useEffect(() => {
    load().catch(() => setServerError("Failed to load players"));
  }, [load]);

  // Changing the sport filter; a sport-specific sort no longer applies, so reset it.
  function changeSportFilter(next: string) {
    setPage(1);
    setSportFilter(next);
    if (SPORT_SPECIFIC.includes(sortField)) {
      setSortField("createdAt");
      setSortDir("desc");
    }
  }

  function toggleSort(field: PlayerSortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
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

  const photoCell = (p: Player): ReactNode => (
    <label className="flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-slate-800 text-[10px] text-slate-500 hover:ring-2 hover:ring-indigo-400">
      {p.photoUrl ? (
        <img src={photoSrc(p.photoUrl)} alt={p.name} className="h-full w-full object-cover" />
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
  );

  const nationalityCell = (p: Player): ReactNode =>
    p.nationality ? (
      <span className="inline-flex items-center gap-2">
        <Flag code={p.nationality} />
        {nationByCode(p.nationality)?.name ?? p.nationality}
      </span>
    ) : (
      "—"
    );

  const dobCell = (p: Player): ReactNode => {
    if (!p.dateOfBirth) return "—";
    const age = ageFrom(p.dateOfBirth);
    return (
      <span>
        {p.dateOfBirth}
        {age !== null && <span className="text-slate-500"> ({age}y)</span>}
      </span>
    );
  };

  // Columns adapt to the sport filter: common columns always, plus the selected
  // sport's structured columns. "All sports" shows the Sport column instead.
  function buildColumns(): Column[] {
    const cols: Column[] = [
      { key: null, label: "Photo", render: photoCell },
      {
        key: "name",
        label: "Name",
        render: (p) => <span className="font-medium text-slate-100">{p.name}</span>,
      },
    ];

    if (!sportFilter) {
      cols.push({ key: "sport", label: "Sport", render: (p) => p.sport });
    } else if (sportFilter === "CRICKET") {
      cols.push(
        {
          key: "cricketRole",
          label: "Role",
          render: (p) => (p.cricketRole ? CRICKET_ROLE_LABELS[p.cricketRole] : "—"),
        },
        {
          key: "battingPosition",
          label: "Bat pos",
          render: (p) => (p.battingPosition ? BATTING_POSITION_LABELS[p.battingPosition] : "—"),
        },
        {
          key: "bowlingStyle",
          label: "Bowl style",
          render: (p) => (p.bowlingStyle ? BOWLING_STYLE_LABELS[p.bowlingStyle] : "—"),
        },
        {
          key: "allRounderType",
          label: "AR type",
          render: (p) => (p.allRounderType ? ALL_ROUNDER_TYPE_LABELS[p.allRounderType] : "—"),
        },
      );
    } else if (sportFilter === "FOOTBALL") {
      cols.push(
        { key: "footballPosition", label: "Position", render: (p) => p.footballPosition ?? "—" },
        {
          key: "footballDetailPosition",
          label: "Detail",
          render: (p) => p.footballDetailPosition ?? "—",
        },
      );
    } else {
      // BASKETBALL / OTHER use the freeform role.
      cols.push({ key: "role", label: "Role", render: (p) => p.role ?? "—" });
    }

    cols.push(
      { key: "nationality", label: "Nationality", render: nationalityCell },
      { key: "dateOfBirth", label: "DOB", render: dobCell },
      { key: "externalRef", label: "Ext ref", render: (p) => p.externalRef ?? "—" },
      { key: "createdAt", label: "Added", render: (p) => p.createdAt.slice(0, 10) },
      {
        key: null,
        label: "",
        render: (p) => (
          <Button variant="outline" className="px-2 py-1 text-xs" onClick={() => setEditing(p)}>
            Edit
          </Button>
        ),
      },
    );
    return cols;
  }

  const columns = buildColumns();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Players</h1>

      <div className="grid gap-6 md:grid-cols-[20rem_1fr]">
        <Card className="h-fit">
          <h2 className="mb-4 font-medium">Add player</h2>
          <PlayerForm
            mode="create"
            onSuccess={(msg) => {
              setSuccess(msg);
              setPage(1);
              void load();
            }}
          />
          {success && <p className="mt-3 text-sm text-emerald-400">{success}</p>}
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
              onChange={(e) => changeSportFilter(e.target.value)}
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
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="text-slate-400">
                <tr className="border-b border-slate-800">
                  {columns.map((col, i) => (
                    <th key={i} className="pb-2 font-medium">
                      {col.key ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key as PlayerSortField)}
                          className="inline-flex items-center gap-1 hover:text-slate-100"
                        >
                          {col.label}
                          <span className="text-[10px]">
                            {sortField === col.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id} className="border-b border-slate-800/50">
                    {columns.map((col, i) => (
                      <td key={i} className="py-2 text-slate-400">
                        {col.render(p)}
                      </td>
                    ))}
                  </tr>
                ))}
                {players.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="py-4 text-center text-slate-500">
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

      {serverError && <p className="text-sm text-red-400">{serverError}</p>}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit player">
        {editing && (
          <PlayerForm
            key={editing.id}
            mode="edit"
            player={editing}
            onSuccess={(msg) => {
              setEditing(null);
              setSuccess(msg);
              void load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
