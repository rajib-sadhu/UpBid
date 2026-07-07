import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { LineupBuilderData, LineupMemberDTO } from "shared";
import { apiFetch, ApiClientError } from "../../api/client.js";
import { Card } from "../../components/ui/card.js";
import { CricketRoleIcon } from "../../components/ui/role-icon.js";

const BADGES: { key: keyof LineupMemberDTO; label: string; cls: string }[] = [
  { key: "isCaptain", label: "C", cls: "bg-amber-500/20 text-amber-300" },
  { key: "isViceCaptain", label: "VC", cls: "bg-amber-500/10 text-amber-400/80" },
  { key: "isWicketkeeper", label: "WK", cls: "bg-indigo-500/15 text-indigo-300" },
  { key: "isFirstBowler", label: "1st bowler", cls: "bg-sky-500/15 text-sky-300" },
  { key: "isSecondBowler", label: "2nd bowler", cls: "bg-sky-500/10 text-sky-400/80" },
];

function MemberRow({ m, order }: { m: LineupMemberDTO; order: number | null }) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-slate-800 px-3 py-2">
      <span className="w-5 shrink-0 text-right text-sm tabular-nums text-slate-500">
        {order ?? "—"}
      </span>
      <CricketRoleIcon
        cricketRole={m.cricketRole}
        bowlingStyle={m.bowlingStyle}
        className="h-4 w-4"
      />
      <span className="min-w-0 flex-1 truncate font-medium">
        {m.playerName}
        {m.isOverseas && <span className="ml-1 text-xs text-sky-400">✈</span>}
        {m.assignedPosition && (
          <span className="ml-2 text-xs text-slate-500">{m.assignedPosition}</span>
        )}
      </span>
      <span className="flex shrink-0 gap-1">
        {BADGES.filter((b) => m[b.key] === true).map((b) => (
          <span key={b.label} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${b.cls}`}>
            {b.label}
          </span>
        ))}
      </span>
    </li>
  );
}

/**
 * Read-only team-sheet view of a lineup: the XI in batting order with C / VC /
 * WK / bowler badges, bench below. Rivals see this once a lineup is LOCKED;
 * the owner can jump back into the builder from here while editing is allowed.
 */
export function LineupViewPage() {
  const { teamId = "" } = useParams();
  const [data, setData] = useState<LineupBuilderData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<LineupBuilderData>(`/api/teams/${teamId}/lineup`)
      .then(setData)
      .catch((e) =>
        setError(
          e instanceof ApiClientError && e.status === 403
            ? "This lineup isn't visible yet — it becomes public once the team locks it."
            : "Failed to load the lineup",
        ),
      );
  }, [teamId]);

  if (error) {
    return (
      <Card>
        <p className="py-4 text-center text-slate-400">{error}</p>
      </Card>
    );
  }
  if (!data) return <p className="text-slate-500">Loading…</p>;

  const byOrder = (a: LineupMemberDTO, b: LineupMemberDTO) =>
    (a.battingOrder ?? 99) - (b.battingOrder ?? 99);
  const starters = data.lineup.members.filter((m) => m.membership === "STARTER").sort(byOrder);
  const bench = data.lineup.members.filter((m) => m.membership === "BENCH").sort(byOrder);
  const formation =
    data.allowedFormations.find((f) => f.id === data.lineup.formationId)?.name ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{data.lineup.teamName}</h1>
          <p className="text-sm text-slate-500">
            {data.sport}
            {formation ? ` · ${formation}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded px-2 py-0.5 text-xs ${
              data.lineup.status === "LOCKED"
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {data.lineup.status}
          </span>
          {data.canEdit && (
            <Link
              to={`/teams/${teamId}/lineup`}
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              Edit lineup →
            </Link>
          )}
        </div>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          Starting {data.rules.startingSize <= 11 ? "XI" : data.rules.startingSize}
        </h2>
        {starters.length === 0 ? (
          <p className="py-3 text-center text-sm text-slate-500">No starters picked yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {starters.map((m, i) => (
              <MemberRow key={m.teamPlayerId} m={m} order={m.battingOrder ?? i + 1} />
            ))}
          </ul>
        )}
      </Card>

      {bench.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Bench</h2>
          <ul className="space-y-1.5">
            {bench.map((m) => (
              <MemberRow key={m.teamPlayerId} m={m} order={null} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
