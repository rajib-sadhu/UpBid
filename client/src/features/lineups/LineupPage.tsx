import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FOOTBALL_POSITIONS,
  type FootballPosition,
  type LineupMembership,
  type LineupStatus,
  type LineupBuilderData,
  type SaveLineupResponse,
  type LineupDTO,
  type SquadPlayer,
  type Violation,
} from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { Card } from "../../components/ui/card.js";
import { CricketRoleIcon } from "../../components/ui/role-icon.js";
import { Button } from "../../components/ui/button.js";
import { Select } from "../../components/ui/select.js";

interface MemberState {
  membership: LineupMembership;
  battingOrder: number | null;
  isWicketkeeper: boolean;
  isFirstBowler: boolean;
  isSecondBowler: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  assignedPosition: FootballPosition | null;
}

const emptyMember = (): MemberState => ({
  membership: "RESERVE",
  battingOrder: null,
  isWicketkeeper: false,
  isFirstBowler: false,
  isSecondBowler: false,
  isCaptain: false,
  isViceCaptain: false,
  assignedPosition: null,
});

export function LineupPage() {
  const { teamId = "" } = useParams();
  const [data, setData] = useState<LineupBuilderData | null>(null);
  const [members, setMembers] = useState<Record<string, MemberState>>({});
  const [formationId, setFormationId] = useState<string | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [status, setStatus] = useState<LineupStatus>("DRAFT");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await apiFetch<LineupBuilderData>(`/api/teams/${teamId}/lineup`);
    const init: Record<string, MemberState> = {};
    for (const sp of d.squad) init[sp.teamPlayerId] = emptyMember();
    for (const m of d.lineup.members) {
      init[m.teamPlayerId] = {
        membership: m.membership,
        battingOrder: m.battingOrder,
        isWicketkeeper: m.isWicketkeeper,
        isFirstBowler: m.isFirstBowler,
        isSecondBowler: m.isSecondBowler,
        isCaptain: m.isCaptain,
        isViceCaptain: m.isViceCaptain,
        assignedPosition: m.assignedPosition,
      };
    }
    setData(d);
    setMembers(init);
    setFormationId(d.lineup.formationId);
    setStatus(d.lineup.status);
    setViolations(d.violations);
  }, [teamId]);

  useEffect(() => {
    load().catch(() => setError("Failed to load lineup"));
  }, [load]);

  const setMember = useCallback((teamPlayerId: string, patch: Partial<MemberState>) => {
    setMembers((prev) => ({ ...prev, [teamPlayerId]: { ...prev[teamPlayerId]!, ...patch } }));
  }, []);

  /** Cricket: commit the XI as an ordered list — position IS the batting order.
   * Everyone else drops back to reserve with role flags cleared. */
  const applyXI = useCallback((orderedIds: string[]) => {
    setMembers((prev) => {
      const next: Record<string, MemberState> = {};
      for (const [id, m] of Object.entries(prev)) {
        const idx = orderedIds.indexOf(id);
        next[id] =
          idx >= 0
            ? { ...m, membership: "STARTER", battingOrder: idx + 1 }
            : {
                ...m,
                membership: "RESERVE",
                battingOrder: null,
                isWicketkeeper: false,
                isFirstBowler: false,
                isSecondBowler: false,
                isCaptain: false,
                isViceCaptain: false,
              };
      }
      return next;
    });
  }, []);

  /** Cricket: exclusive role chips — turning a role on moves it off everyone
   * else, AND auto-replaces roles the same player can't hold together:
   * 1st ↔ 2nd bowler, WK ↔ either bowler, captain ↔ vice-captain. */
  const toggleRole = useCallback((teamPlayerId: string, flag: RoleFlag) => {
    setMembers((prev) => {
      const turnOn = !prev[teamPlayerId]?.[flag];
      const next: Record<string, MemberState> = {};
      for (const [id, m] of Object.entries(prev)) {
        if (id !== teamPlayerId) {
          next[id] = { ...m, [flag]: false }; // only one player holds each role
        } else {
          const cleared = turnOn
            ? Object.fromEntries(ROLE_CONFLICTS[flag].map((f) => [f, false]))
            : {};
          next[id] = { ...m, ...cleared, [flag]: turnOn };
        }
      }
      return next;
    });
  }, []);

  /** What still blocks a save — mirrors the server's completeness bar so the
   * Save button can stay disabled with an explicit checklist. */
  const missing = useMemo(() => {
    if (!data) return [];
    const list: string[] = [];
    const starters = data.squad.filter((s) => members[s.teamPlayerId]?.membership === "STARTER");
    if (starters.length !== data.rules.startingSize) {
      list.push(`Starting lineup (${starters.length}/${data.rules.startingSize})`);
    }
    const has = (f: RoleFlag) => starters.some((s) => members[s.teamPlayerId]?.[f]);
    if (data.sport === "CRICKET") {
      if (data.rules.requireWicketkeeper && !has("isWicketkeeper")) list.push("Wicketkeeper");
      if (data.rules.requireCaptain && !has("isCaptain")) list.push("Captain");
      if (data.rules.requireViceCaptain && !has("isViceCaptain")) list.push("Vice-captain");
      if (data.rules.requireFirstBowler && !has("isFirstBowler")) list.push("1st bowler");
      if (data.rules.requireSecondBowler && !has("isSecondBowler")) list.push("2nd bowler");
    } else if (data.sport === "FOOTBALL" && !formationId) {
      list.push("Formation");
    }
    return list;
  }, [data, members, formationId]);

  async function save() {
    if (!data) return;
    setError(null);
    setMsg(null);
    const payload = {
      formationId: data.sport === "FOOTBALL" ? formationId : null,
      members: data.squad.map((sp) => ({
        teamPlayerId: sp.teamPlayerId,
        ...members[sp.teamPlayerId]!,
      })),
    };
    try {
      const res = await apiFetch<SaveLineupResponse>(`/api/teams/${teamId}/lineup`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setViolations(res.violations);
      setStatus(res.lineup.status);
      setMsg("Saved — lineup complete.");
    } catch (e) {
      if (e instanceof ApiClientError) {
        setError(e.message);
        if (Array.isArray(e.details)) setViolations(e.details as Violation[]);
      } else setError("Save failed");
    }
  }

  async function lock() {
    setError(null);
    setMsg(null);
    try {
      const l = await apiFetch<LineupDTO>(`/api/teams/${teamId}/lineup/lock`, { method: "POST" });
      setStatus(l.status);
      setViolations([]);
      setMsg("Lineup locked.");
    } catch (e) {
      if (e instanceof ApiClientError) {
        setError(e.message);
        if (Array.isArray(e.details)) setViolations(e.details as Violation[]);
      } else setError("Lock failed");
    }
  }

  async function unlock() {
    setError(null);
    try {
      const l = await apiFetch<LineupDTO>(`/api/teams/${teamId}/lineup/unlock`, { method: "POST" });
      setStatus(l.status);
      setMsg("Unlocked for editing.");
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Unlock failed");
    }
  }

  if (!data) return <p className="text-slate-400">{error ?? "Loading…"}</p>;

  const disabled = !data.canEdit || status === "LOCKED";
  const notCompleted = data.auctionStatus !== "COMPLETED";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{data.lineup.teamName} — Lineup</h1>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            status === "LOCKED"
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-slate-500/15 text-slate-300"
          }`}
        >
          {status}
        </span>
        <span className="text-xs text-slate-500">{data.sport}</span>
      </div>

      {notCompleted && (
        <p className="text-sm text-amber-400">
          The auction is not completed yet — lineups can only be built once it is.
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      <ViolationList violations={violations} />

      {data.sport === "FOOTBALL" ? (
        <FootballBuilder
          squad={data.squad}
          members={members}
          setMember={setMember}
          startingSize={data.rules.startingSize}
          benchSize={data.rules.benchSize}
          formationId={formationId}
          setFormationId={setFormationId}
          allowedFormations={data.allowedFormations}
          disabled={disabled}
        />
      ) : (
        <CricketBuilder
          squad={data.squad}
          members={members}
          applyXI={applyXI}
          toggleRole={toggleRole}
          startingSize={data.rules.startingSize}
          disabled={disabled}
        />
      )}

      {data.canEdit && status !== "LOCKED" && missing.length > 0 && (
        <p className="text-sm text-amber-400">
          To save, still needed:{" "}
          {missing.map((m) => (
            <span
              key={m}
              className="mr-1.5 inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-xs"
            >
              {m}
            </span>
          ))}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {data.canEdit && status !== "LOCKED" && (
          <Button
            onClick={() => void save()}
            disabled={notCompleted || missing.length > 0}
            title={missing.length ? `Still needed: ${missing.join(", ")}` : undefined}
          >
            Save
          </Button>
        )}
        {data.canLock && status !== "LOCKED" && (
          <Button variant="outline" onClick={() => void lock()} disabled={notCompleted}>
            Lock lineup
          </Button>
        )}
        {data.canLock && status === "LOCKED" && (
          <Button variant="outline" onClick={() => void unlock()}>
            Unlock
          </Button>
        )}
        {status === "LOCKED" && !data.canLock && (
          <span className="text-sm text-slate-400">This lineup is locked by the organizer.</span>
        )}
      </div>
    </div>
  );
}

function ViolationList({ violations }: { violations: Violation[] }) {
  if (violations.length === 0) {
    return <p className="text-sm text-emerald-400">No validation issues — ready to lock.</p>;
  }
  return (
    <Card className="border-amber-700/50 bg-amber-500/5 p-4">
      <p className="mb-2 text-sm font-medium text-amber-300">{violations.length} issue(s) to fix</p>
      <ul className="space-y-1 text-sm text-amber-200/90">
        {violations.map((v, i) => (
          <li key={`${v.code}-${i}`}>
            <span className="font-mono text-xs">{v.code}</span>
            {v.detail ? ` — ${v.detail}` : ""}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Check({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900"
      />
      {label}
    </label>
  );
}

function PlayerCell({ sp }: { sp: SquadPlayer }) {
  return (
    <div className="min-w-0">
      {sp.cricketRole && (
        <CricketRoleIcon
          cricketRole={sp.cricketRole}
          bowlingStyle={sp.bowlingStyle}
          className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]"
        />
      )}
      <span className="font-medium">{sp.playerName}</span>
      {sp.isOverseas && <span className="ml-1 text-xs text-sky-400">✈</span>}
      {sp.footballPosition && (
        <span className="ml-2 text-xs text-slate-500">{sp.footballPosition}</span>
      )}
    </div>
  );
}

// ---- Cricket drag-and-drop builder ------------------------------------------
// Left: the ordered XI — list position IS the batting order; drag rows to
// reorder, click the chips to hand out C / VC / WK / 1st / 2nd bowler. Right:
// the rest of the squad — drag a player in (or press +) to make them a starter.

type RoleFlag = "isCaptain" | "isViceCaptain" | "isWicketkeeper" | "isFirstBowler" | "isSecondBowler";

/** Roles ONE player can never hold together — turning the key on clears these. */
const ROLE_CONFLICTS: Record<RoleFlag, RoleFlag[]> = {
  isCaptain: ["isViceCaptain"],
  isViceCaptain: ["isCaptain"],
  isWicketkeeper: ["isFirstBowler", "isSecondBowler"],
  isFirstBowler: ["isSecondBowler", "isWicketkeeper"],
  isSecondBowler: ["isFirstBowler", "isWicketkeeper"],
};

/** Where the POINTER is wins (so dropping into an empty XI zone registers);
 * fall back to closest-center for keyboard/edge cases. */
const dropDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCenter(args);
};

const ROLE_CHIPS: { flag: RoleFlag; label: string }[] = [
  { flag: "isCaptain", label: "C" },
  { flag: "isViceCaptain", label: "VC" },
  { flag: "isWicketkeeper", label: "WK" },
  { flag: "isFirstBowler", label: "1B" },
  { flag: "isSecondBowler", label: "2B" },
];

function RoleChips({
  m,
  onToggle,
  disabled,
}: {
  m: MemberState;
  onToggle: (flag: RoleFlag) => void;
  disabled: boolean;
}) {
  return (
    <span className="flex shrink-0 gap-1">
      {ROLE_CHIPS.map(({ flag, label }) => (
        <button
          key={flag}
          type="button"
          disabled={disabled}
          title={
            { C: "Captain", VC: "Vice-captain", WK: "Wicketkeeper", "1B": "1st bowler", "2B": "2nd bowler" }[
              label
            ]
          }
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
            m[flag]
              ? "bg-amber-500/25 text-amber-300 ring-1 ring-amber-500/60"
              : "bg-slate-800 text-slate-500 hover:text-slate-300"
          } ${disabled ? "cursor-default" : ""}`}
          onClick={() => onToggle(flag)}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

function XIRow({
  sp,
  index,
  m,
  onToggle,
  onRemove,
  onMove,
  last,
  disabled,
}: {
  sp: SquadPlayer;
  index: number;
  m: MemberState;
  onToggle: (flag: RoleFlag) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  last: boolean;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `xi:${sp.teamPlayerId}`,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
        isDragging ? "z-10 border-indigo-500 bg-slate-800" : "border-slate-800 bg-slate-900/60"
      }`}
    >
      {!disabled && (
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none select-none px-1 text-slate-600 hover:text-slate-300"
          title="Drag to reorder"
        >
          ⠿
        </span>
      )}
      <span className="w-5 shrink-0 text-right text-sm font-semibold tabular-nums text-indigo-300">
        {index + 1}
      </span>
      <CricketRoleIcon
        cricketRole={sp.cricketRole}
        bowlingStyle={sp.bowlingStyle}
        className="h-4 w-4"
      />
      <span className="min-w-0 flex-1 truncate text-sm">
        {sp.playerName}
        {sp.isOverseas && <span className="ml-1 text-xs text-sky-400">✈</span>}
      </span>
      <RoleChips m={m} onToggle={onToggle} disabled={disabled} />
      {!disabled && (
        <span className="flex shrink-0 gap-0.5 text-slate-500">
          <button type="button" className="px-1 hover:text-slate-200 disabled:opacity-30" disabled={index === 0} onClick={() => onMove(-1)} title="Move up">
            ↑
          </button>
          <button type="button" className="px-1 hover:text-slate-200 disabled:opacity-30" disabled={last} onClick={() => onMove(1)} title="Move down">
            ↓
          </button>
          <button type="button" className="px-1 text-red-400/70 hover:text-red-300" onClick={onRemove} title="Remove from XI">
            −
          </button>
        </span>
      )}
    </div>
  );
}

/** A droppable region. MUST be rendered inside <DndContext> — a useDroppable
 * called in the component that renders the context itself never registers. */
function DropZone({
  id,
  overClass,
  children,
}: {
  id: string;
  overClass: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`space-y-1.5 rounded-lg p-1 ${isOver ? overClass : ""}`}>
      {children}
    </div>
  );
}

function SquadRow({ sp, onAdd, canAdd, disabled }: { sp: SquadPlayer; onAdd: () => void; canAdd: boolean; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `sq:${sp.teamPlayerId}`,
    disabled: disabled || !canAdd,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
        isDragging ? "z-10 border-indigo-500 bg-slate-800" : "border-slate-800"
      } ${disabled || !canAdd ? "opacity-60" : ""}`}
    >
      {!disabled && canAdd && (
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none select-none px-1 text-slate-600 hover:text-slate-300"
          title="Drag into the XI"
        >
          ⠿
        </span>
      )}
      <CricketRoleIcon
        cricketRole={sp.cricketRole}
        bowlingStyle={sp.bowlingStyle}
        className="h-4 w-4"
      />
      <span className="min-w-0 flex-1 truncate text-sm">
        {sp.playerName}
        {sp.isOverseas && <span className="ml-1 text-xs text-sky-400">✈</span>}
      </span>
      {!disabled && (
        <button
          type="button"
          disabled={!canAdd}
          className="shrink-0 px-1 text-emerald-400/80 hover:text-emerald-300 disabled:opacity-30"
          onClick={onAdd}
          title={canAdd ? "Add to XI" : "XI is full"}
        >
          +
        </button>
      )}
    </div>
  );
}

function CricketBuilder({
  squad,
  members,
  applyXI,
  toggleRole,
  startingSize,
  disabled,
}: {
  squad: SquadPlayer[];
  members: Record<string, MemberState>;
  applyXI: (orderedIds: string[]) => void;
  toggleRole: (id: string, flag: RoleFlag) => void;
  startingSize: number;
  disabled: boolean;
}) {
  const byId = useMemo(() => new Map(squad.map((s) => [s.teamPlayerId, s])), [squad]);
  // The XI in batting order (saved orders first, squad order as tiebreak).
  const xi = useMemo(
    () =>
      squad
        .filter((s) => members[s.teamPlayerId]?.membership === "STARTER")
        .sort(
          (a, b) =>
            (members[a.teamPlayerId]?.battingOrder ?? 99) -
            (members[b.teamPlayerId]?.battingOrder ?? 99),
        )
        .map((s) => s.teamPlayerId),
    [squad, members],
  );
  const rest = useMemo(() => squad.filter((s) => !xi.includes(s.teamPlayerId)), [squad, xi]);
  const full = xi.length >= startingSize;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(ev: DragEndEvent) {
    const a = String(ev.active.id);
    const o = ev.over ? String(ev.over.id) : null;
    if (!o) return;
    if (a.startsWith("xi:")) {
      const from = xi.indexOf(a.slice(3));
      if (o === "squad-zone") {
        applyXI(xi.filter((id) => id !== a.slice(3))); // dragged out → reserve
      } else if (o.startsWith("xi:") && from >= 0) {
        const to = xi.indexOf(o.slice(3));
        if (to >= 0 && to !== from) applyXI(arrayMove(xi, from, to));
      } else if (o === "xi-zone" && from >= 0) {
        applyXI(arrayMove(xi, from, xi.length - 1)); // dropped past the rows → last
      }
    } else if (a.startsWith("sq:") && !full) {
      const id = a.slice(3);
      if (o === "xi-zone") applyXI([...xi, id]);
      else if (o.startsWith("xi:")) {
        const at = xi.indexOf(o.slice(3));
        const next = [...xi];
        next.splice(at < 0 ? xi.length : at, 0, id);
        applyXI(next);
      }
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={dropDetection} onDragEnd={onDragEnd}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-3 text-sm text-slate-400">
            Starting lineup — position = batting order ·{" "}
            <span className={xi.length === startingSize ? "text-emerald-400" : "text-amber-400"}>
              {xi.length}
            </span>
            /{startingSize}
          </p>
          <DropZone id="xi-zone" overClass="bg-indigo-500/10 ring-1 ring-indigo-500/50">
            <SortableContext items={xi.map((id) => `xi:${id}`)} strategy={verticalListSortingStrategy}>
              {xi.map((id, i) => {
                const sp = byId.get(id);
                const m = members[id];
                if (!sp || !m) return null;
                return (
                  <XIRow
                    key={id}
                    sp={sp}
                    index={i}
                    m={m}
                    disabled={disabled}
                    last={i === xi.length - 1}
                    onToggle={(flag) => toggleRole(id, flag)}
                    onRemove={() => applyXI(xi.filter((x) => x !== id))}
                    onMove={(dir) => applyXI(arrayMove(xi, i, i + dir))}
                  />
                );
              })}
            </SortableContext>
            {Array.from({ length: Math.max(0, startingSize - xi.length) }, (_, i) => (
              <div
                key={`ghost-${i}`}
                className="flex items-center gap-2 rounded-md border border-dashed border-slate-800 px-2 py-1.5 text-slate-600"
              >
                <span className="w-5 text-right text-sm tabular-nums">{xi.length + i + 1}</span>
                <span className="text-xs">Drop a player here</span>
              </div>
            ))}
          </DropZone>
        </Card>

        <Card>
          <p className="mb-3 text-sm text-slate-400">
            Squad ({rest.length}) — not in the XI{disabled ? "" : "; drag or + to add"}
          </p>
          <DropZone id="squad-zone" overClass="bg-red-500/5 ring-1 ring-red-500/40">
            {rest.map((sp) => (
              <SquadRow
                key={sp.teamPlayerId}
                sp={sp}
                disabled={disabled}
                canAdd={!full}
                onAdd={() => applyXI([...xi, sp.teamPlayerId])}
              />
            ))}
            {rest.length === 0 && (
              <p className="py-3 text-center text-xs text-slate-600">Everyone is in the XI.</p>
            )}
          </DropZone>
        </Card>
      </div>
    </DndContext>
  );
}

function FootballBuilder({
  squad,
  members,
  setMember,
  startingSize,
  benchSize,
  formationId,
  setFormationId,
  allowedFormations,
  disabled,
}: {
  squad: SquadPlayer[];
  members: Record<string, MemberState>;
  setMember: (id: string, patch: Partial<MemberState>) => void;
  startingSize: number;
  benchSize: number | null;
  formationId: string | null;
  setFormationId: (id: string | null) => void;
  allowedFormations: LineupBuilderData["allowedFormations"];
  disabled: boolean;
}) {
  const starters = squad.filter((s) => members[s.teamPlayerId]?.membership === "STARTER").length;
  const bench = squad.filter((s) => members[s.teamPlayerId]?.membership === "BENCH").length;
  const formation = allowedFormations.find((f) => f.id === formationId);
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="block text-sm text-slate-300">Formation</label>
          <Select
            className="w-40"
            value={formationId ?? ""}
            disabled={disabled}
            onChange={(e) => setFormationId(e.target.value || null)}
          >
            <option value="">Select…</option>
            {allowedFormations.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-sm text-slate-400">
          Starters {starters}/{startingSize}
          {benchSize != null && (
            <>
              {" "}
              · Bench {bench}/{benchSize}
            </>
          )}
          {formation && (
            <span className="ml-2 text-xs text-slate-500">
              ({formation.numGK}-{formation.numDef}-{formation.numMid}-{formation.numFwd})
            </span>
          )}
        </p>
      </div>
      <div className="space-y-2">
        {squad.map((sp) => {
          const m = members[sp.teamPlayerId]!;
          const isStarter = m.membership === "STARTER";
          return (
            <div key={sp.teamPlayerId} className="rounded-md border border-slate-800 px-3 py-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-40">
                  <PlayerCell sp={sp} />
                </div>
                <Select
                  className="w-32"
                  value={m.membership}
                  disabled={disabled}
                  onChange={(e) =>
                    setMember(sp.teamPlayerId, {
                      membership: e.target.value as LineupMembership,
                      ...(e.target.value !== "STARTER"
                        ? { assignedPosition: null, isCaptain: false, isViceCaptain: false }
                        : {}),
                    })
                  }
                >
                  <option value="STARTER">Starter (XI)</option>
                  <option value="BENCH">Bench</option>
                  <option value="RESERVE">Reserve</option>
                </Select>
                {isStarter && (
                  <>
                    <Select
                      className="w-24"
                      value={m.assignedPosition ?? ""}
                      disabled={disabled}
                      onChange={(e) =>
                        setMember(sp.teamPlayerId, {
                          assignedPosition: (e.target.value || null) as FootballPosition | null,
                        })
                      }
                    >
                      <option value="">Slot…</option>
                      {FOOTBALL_POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                    <div className="flex flex-wrap gap-3">
                      <Check
                        label="Capt"
                        checked={m.isCaptain}
                        disabled={disabled}
                        onChange={(v) => setMember(sp.teamPlayerId, { isCaptain: v })}
                      />
                      <Check
                        label="VC"
                        checked={m.isViceCaptain}
                        disabled={disabled}
                        onChange={(v) => setMember(sp.teamPlayerId, { isViceCaptain: v })}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
