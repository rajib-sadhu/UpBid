import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
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
      setMsg(
        res.violations.length
          ? `Saved with ${res.violations.length} issue(s).`
          : "Saved — no issues.",
      );
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Save failed");
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
          setMember={setMember}
          startingSize={data.rules.startingSize}
          disabled={disabled}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {data.canEdit && status !== "LOCKED" && (
          <Button onClick={() => void save()} disabled={notCompleted}>
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
      <span className="font-medium">{sp.playerName}</span>
      {sp.isOverseas && <span className="ml-1 text-xs text-sky-400">✈</span>}
      {sp.footballPosition && (
        <span className="ml-2 text-xs text-slate-500">{sp.footballPosition}</span>
      )}
    </div>
  );
}

function CricketBuilder({
  squad,
  members,
  setMember,
  startingSize,
  disabled,
}: {
  squad: SquadPlayer[];
  members: Record<string, MemberState>;
  setMember: (id: string, patch: Partial<MemberState>) => void;
  startingSize: number;
  disabled: boolean;
}) {
  const starters = useMemo(
    () => squad.filter((s) => members[s.teamPlayerId]?.membership === "STARTER").length,
    [squad, members],
  );
  return (
    <Card>
      <p className="mb-3 text-sm text-slate-400">
        Starters:{" "}
        <span className={starters === startingSize ? "text-emerald-400" : "text-amber-400"}>
          {starters}
        </span>
        /{startingSize}
      </p>
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
                        ? {
                            battingOrder: null,
                            isWicketkeeper: false,
                            isFirstBowler: false,
                            isSecondBowler: false,
                            isCaptain: false,
                            isViceCaptain: false,
                          }
                        : {}),
                    })
                  }
                >
                  <option value="STARTER">Starter (XI)</option>
                  <option value="RESERVE">Reserve</option>
                </Select>
                {isStarter && (
                  <>
                    <Select
                      className="w-24"
                      value={m.battingOrder ?? ""}
                      disabled={disabled}
                      onChange={(e) =>
                        setMember(sp.teamPlayerId, {
                          battingOrder: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    >
                      <option value="">Order…</option>
                      {Array.from({ length: startingSize }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                    <div className="flex flex-wrap gap-3">
                      <Check
                        label="WK"
                        checked={m.isWicketkeeper}
                        disabled={disabled}
                        onChange={(v) => setMember(sp.teamPlayerId, { isWicketkeeper: v })}
                      />
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
                      <Check
                        label="1st Bowl"
                        checked={m.isFirstBowler}
                        disabled={disabled}
                        onChange={(v) => setMember(sp.teamPlayerId, { isFirstBowler: v })}
                      />
                      <Check
                        label="2nd Bowl"
                        checked={m.isSecondBowler}
                        disabled={disabled}
                        onChange={(v) => setMember(sp.teamPlayerId, { isSecondBowler: v })}
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
