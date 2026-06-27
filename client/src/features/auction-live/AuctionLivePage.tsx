import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { StateSnapshot, SnapshotTeam, CurrentLot, LiveLot } from "shared";
import { useAuth } from "../auth/AuthContext.js";
import { useAuctionRoom, type AuctionRoom } from "../../socket/useAuctionRoom.js";
import { Card } from "../../components/ui/card.js";
import { Button } from "../../components/ui/button.js";
import { Select } from "../../components/ui/select.js";
import { StatusBadge, Countdown, fmtCr, cmpMoney, PlayerIcon } from "./widgets.js";

export function AuctionLivePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const room = useAuctionRoom(id);
  const { snapshot, conn, lastError } = room;

  // Capture clock skew once per full snapshot (serverTime only changes then).
  const skewRef = useRef(0);
  useEffect(() => {
    if (snapshot) skewRef.current = Date.parse(snapshot.serverTime) - Date.now();
  }, [snapshot?.serverTime]);

  if (!snapshot) {
    return (
      <p className="text-slate-400">
        {conn === "disconnected" ? "Reconnecting…" : "Loading live auction…"}
      </p>
    );
  }

  const { auction, teams, currentLot } = snapshot;
  const isOrg = user?.role === "SUPER_ADMIN" || user?.role === "ORGANIZER";
  const myTeam = teams.find((t) => t.ownerUserId === user?.id) ?? null;
  const leaderName = teams.find((t) => t.id === currentLot?.leadingTeamId)?.name ?? "—";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          to={`/auctions/${auction.id}`}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          ← Setup
        </Link>
        <h1 className="text-2xl font-semibold">{auction.name}</h1>
        <StatusBadge status={auction.status} />
        <span className="text-xs text-slate-500">{auction.round} round</span>
        <span className="text-xs text-slate-500">{auction.biddingMode} bidding</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              conn === "connected" ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {conn}
        </span>
      </header>

      {lastError && (
        <p className="text-sm text-red-400">
          {lastError.code}: {lastError.message}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <CurrentLotCard lot={currentLot} skewMs={skewRef.current} leaderName={leaderName} />
          {auction.status !== "ASSIGNMENT" && auction.status !== "COMPLETED" && (
            <BidControls
              room={room}
              snapshot={snapshot}
              userId={user?.id}
              isOrg={isOrg}
              myTeam={myTeam}
            />
          )}
          {isOrg && <OrganizerControls room={room} snapshot={snapshot} />}
        </div>
        <TeamsBoard
          teams={teams}
          creditPerTeam={snapshot.rules?.creditPerTeam ?? null}
          leadingTeamId={currentLot?.leadingTeamId ?? null}
          myTeamId={myTeam?.id ?? null}
        />
      </div>

      {auction.status === "COMPLETED" && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Lineups</h3>
          <div className="space-y-2">
            {(isOrg ? teams : teams.filter((t) => t.id === myTeam?.id)).map((t) => (
              <Link
                key={t.id}
                to={`/teams/${t.id}/lineup`}
                className="flex items-center justify-between rounded-md border border-slate-800 px-3 py-2 hover:bg-slate-800/50"
              >
                <span className="font-medium">{t.name}</span>
                <span className="text-sm text-indigo-400">Build lineup →</span>
              </Link>
            ))}
            {!isOrg && !myTeam && (
              <p className="text-sm text-slate-400">You have no team in this auction.</p>
            )}
          </div>
        </Card>
      )}

      {auction.status === "ASSIGNMENT" ? (
        <AssignmentPanel room={room} snapshot={snapshot} isOrg={isOrg} myTeam={myTeam} />
      ) : (
        <LotQueue snapshot={snapshot} isOrg={isOrg} onOpen={room.openLot} />
      )}

      <TeamRosters teams={teams} lots={snapshot.lots.items} myTeamId={myTeam?.id ?? null} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function CurrentLotCard({
  lot,
  skewMs,
  leaderName,
}: {
  lot: CurrentLot | null;
  skewMs: number;
  leaderName: string;
}) {
  if (!lot) {
    return (
      <Card>
        <p className="text-slate-400">No lot on the block. The organizer opens the next player.</p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex gap-4">
        {lot.photoUrl ? (
          <img
            src={lot.photoUrl}
            alt={lot.playerName}
            className="h-24 w-24 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-slate-800 text-2xl text-slate-500">
            {lot.playerName.charAt(0)}
          </div>
        )}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{lot.playerName}</h2>
            {lot.isOverseas && (
              <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-300">
                OVERSEAS
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">Base {fmtCr(lot.basePrice)}</p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Current</p>
              <p className="text-lg font-semibold text-slate-100">
                {lot.currentPrice ? fmtCr(lot.currentPrice) : "No bids"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Leader</p>
              <p className="font-medium text-slate-200">{lot.currentPrice ? leaderName : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Next bid</p>
              <p className="font-medium text-slate-200">{fmtCr(lot.requiredNextBid)}</p>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">{lot.timerState}</p>
          <p className="text-2xl">
            <Countdown endsAt={lot.endsAt} skewMs={skewMs} />
          </p>
        </div>
      </div>
    </Card>
  );
}

function BidControls({
  room,
  snapshot,
  userId,
  isOrg,
  myTeam,
}: {
  room: AuctionRoom;
  snapshot: StateSnapshot;
  userId: string | undefined;
  isOrg: boolean;
  myTeam: SnapshotTeam | null;
}) {
  const lot = snapshot.currentLot;
  const [orgTeamId, setOrgTeamId] = useState("");
  void userId;
  if (!lot) return null;

  const mode = snapshot.auction.biddingMode;
  const rules = snapshot.rules;
  const biddable = lot.timerState === "BIDDING";
  const reject = room.lastReject;
  const rejectMsg = reject ? `${reject.code}: ${reject.message}` : null;

  if (mode === "FRANCHISE") {
    if (!myTeam) {
      return (
        <Card>
          <p className="text-sm text-slate-400">
            {isOrg
              ? "Franchise-led bidding — each franchise bids from its own screen."
              : "You are not a franchise team in this auction."}
          </p>
        </Card>
      );
    }
    const isLeading = lot.leadingTeamId === myTeam.id;
    const full = rules ? myTeam.playerCount >= rules.maxPlayersPerTeam : false;
    const canAfford = cmpMoney(myTeam.maxBid, lot.requiredNextBid) >= 0;
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm">
            <p className="text-slate-400">
              Bidding as <span className="text-slate-100">{myTeam.name}</span> ·{" "}
              {fmtCr(myTeam.maxBid)} max
            </p>
            {isLeading && <p className="text-emerald-400">You are the highest bidder</p>}
            {!isLeading && !canAfford && (
              <p className="text-amber-400">Next bid exceeds your budget</p>
            )}
            {full && <p className="text-amber-400">Your squad is full</p>}
            {rejectMsg && <p className="text-red-400">{rejectMsg}</p>}
          </div>
          <Button
            disabled={!biddable || isLeading || full || !canAfford}
            onClick={() => room.placeBid(lot, myTeam.id)}
          >
            Bid {fmtCr(lot.requiredNextBid)}
          </Button>
        </div>
      </Card>
    );
  }

  // ORGANIZER mode
  if (!isOrg) {
    return (
      <Card>
        <p className="text-sm text-slate-400">
          Organizer-led bidding — the organizer places every bid. Watch the action live.
        </p>
      </Card>
    );
  }
  const team = snapshot.teams.find((t) => t.id === orgTeamId);
  const canAfford = team ? cmpMoney(team.maxBid, lot.requiredNextBid) >= 0 : false;
  const full = team && rules ? team.playerCount >= rules.maxPlayersPerTeam : false;
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-sm text-slate-300">Bid on behalf of</label>
          <Select value={orgTeamId} onChange={(e) => setOrgTeamId(e.target.value)}>
            <option value="">Select team…</option>
            {snapshot.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {fmtCr(t.maxBid)} left
              </option>
            ))}
          </Select>
        </div>
        <Button
          disabled={!biddable || !team || !canAfford || full || lot.leadingTeamId === orgTeamId}
          onClick={() => orgTeamId && room.placeBid(lot, orgTeamId)}
        >
          Bid {fmtCr(lot.requiredNextBid)}
        </Button>
        {rejectMsg && <p className="self-center text-sm text-red-400">{rejectMsg}</p>}
      </div>
    </Card>
  );
}

function OrganizerControls({ room, snapshot }: { room: AuctionRoom; snapshot: StateSnapshot }) {
  const { auction, currentLot } = snapshot;
  const inRound =
    auction.status === "LIVE" || auction.status === "RE_AUCTION" || auction.status === "PAUSED";
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-300">Organizer controls</h3>
      {inRound && currentLot && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={!currentLot.leadingTeamId}
            onClick={() => room.sellLot(currentLot.auctionPlayerId)}
          >
            Sell to leader
          </Button>
          <Button variant="outline" onClick={() => room.markUnsold(currentLot.auctionPlayerId)}>
            Mark unsold
          </Button>
          <Button variant="ghost" onClick={() => room.addTime(10)}>
            +10s
          </Button>
          <Button variant="ghost" onClick={() => room.addTime(30)}>
            +30s
          </Button>
          {currentLot.timerState === "BIDDING" && (
            <Button variant="ghost" onClick={room.pause}>
              Pause
            </Button>
          )}
          {currentLot.timerState === "PAUSED" && (
            <Button variant="ghost" onClick={room.resume}>
              Resume
            </Button>
          )}
          {currentLot.timerState === "FROZEN" && (
            <span className="self-center text-sm text-amber-400">
              Timer ended — sell, mark unsold, or add time.
            </span>
          )}
        </div>
      )}
      {inRound && !currentLot && (
        <p className="text-sm text-slate-400">
          No lot on the block. Open one from the queue below.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
        {auction.status === "LIVE" && (
          <Button
            variant="outline"
            disabled={!!currentLot}
            onClick={() => room.advancePhase("RE_AUCTION")}
          >
            Start re-auction
          </Button>
        )}
        {(auction.status === "LIVE" || auction.status === "RE_AUCTION") && (
          <Button
            variant="outline"
            disabled={!!currentLot}
            onClick={() => room.advancePhase("ASSIGNMENT")}
          >
            Go to assignment
          </Button>
        )}
        {auction.status === "ASSIGNMENT" && (
          <Button onClick={() => room.advancePhase("COMPLETED")}>Complete auction</Button>
        )}
        {auction.status === "COMPLETED" && (
          <span className="self-center text-sm text-slate-400">Auction completed.</span>
        )}
      </div>
    </Card>
  );
}

function TeamsBoard({
  teams,
  creditPerTeam,
  leadingTeamId,
  myTeamId,
}: {
  teams: SnapshotTeam[];
  creditPerTeam: string | null;
  leadingTeamId: string | null;
  myTeamId: string | null;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Teams</h3>
        {creditPerTeam && (
          <span className="text-xs text-slate-500">Wallet {fmtCr(creditPerTeam)}</span>
        )}
      </div>
      <div className="space-y-2">
        {teams.map((t) => {
          const remaining =
            creditPerTeam != null
              ? (Number(creditPerTeam) - Number(t.committedAmount)).toFixed(2)
              : null;
          return (
            <div
              key={t.id}
              className={`rounded-md border px-3 py-2 ${
                t.id === leadingTeamId ? "border-emerald-600 bg-emerald-500/5" : "border-slate-800"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {t.name}
                  {t.id === myTeamId && <span className="ml-2 text-xs text-indigo-400">you</span>}
                </span>
                <span className="text-xs text-slate-400">{t.playerCount} players</span>
              </div>
              <div className="mt-1 flex justify-between text-xs text-slate-400">
                <span>Spent {fmtCr(t.committedAmount)}</span>
                {remaining != null && <span>Remaining {fmtCr(remaining)}</span>}
                <span>Max {fmtCr(t.maxBid)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Cricket role sections, in display order. Pace bowlers (FAST/MEDIUM_FAST)
 * group together; SPINNER is its own section. */
const CRICKET_SECTIONS: { key: string; label: string; match: (l: LiveLot) => boolean }[] = [
  { key: "BATSMAN", label: "Batsmen", match: (l) => l.cricketRole === "BATSMAN" },
  { key: "WICKETKEEPER", label: "Wicketkeepers", match: (l) => l.cricketRole === "WICKETKEEPER" },
  {
    key: "FAST",
    label: "Fast bowlers",
    match: (l) => l.cricketRole === "BOWLER" && l.bowlingStyle !== "SPINNER",
  },
  {
    key: "SPINNER",
    label: "Spinners",
    match: (l) => l.cricketRole === "BOWLER" && l.bowlingStyle === "SPINNER",
  },
  { key: "ALL_ROUNDER", label: "All-rounders", match: (l) => l.cricketRole === "ALL_ROUNDER" },
];

/** Status-driven card tone: sold→green, unsold→red, on-block→amber, else neutral. */
function lotTone(status: LiveLot["status"]): string {
  switch (status) {
    case "SOLD":
    case "ASSIGNED":
      return "border-emerald-600 bg-emerald-500/5";
    case "UNSOLD":
      return "border-red-600 bg-red-500/5";
    case "ON_BLOCK":
      return "border-amber-500 bg-amber-500/10";
    default:
      return "border-slate-800";
  }
}

function PlayerCard({
  lot,
  index,
  isOrg,
  canOpen,
  onOpen,
  teamName,
}: {
  lot: LiveLot;
  index: number;
  isOrg: boolean;
  canOpen: boolean;
  onOpen: (auctionPlayerId: string) => void;
  teamName: (tid: string | null) => string;
}) {
  const sold = lot.status === "SOLD" || lot.status === "ASSIGNED";
  const showOpen = isOrg && lot.status === "PENDING";
  const info = sold
    ? `${fmtCr(lot.soldPrice)} → ${teamName(lot.soldToTeamId)}`
    : lot.status === "UNSOLD"
      ? "unsold"
      : fmtCr(lot.basePrice);
  return (
    <div className={`flex items-center gap-1 rounded border px-1.5 py-0.5 ${lotTone(lot.status)}`}>
      <span className="w-3 shrink-0 text-right text-[10px] tabular-nums text-slate-500">
        {index}
      </span>
      <PlayerIcon name={lot.playerName} photoUrl={lot.photoUrl} />
      <span className="min-w-0 flex-1 truncate text-xs leading-tight">
        {lot.playerName}
        {lot.isOverseas && <span className="ml-0.5 text-[10px] text-sky-400">✈</span>}
      </span>
      {showOpen ? (
        <Button
          variant="ghost"
          className="h-auto shrink-0 px-1 py-0 text-[10px]"
          disabled={!canOpen}
          onClick={() => onOpen(lot.auctionPlayerId)}
        >
          Open
        </Button>
      ) : (
        <span className="shrink-0 truncate text-[10px] text-slate-400">{info}</span>
      )}
    </div>
  );
}

function LotQueue({
  snapshot,
  isOrg,
  onOpen,
}: {
  snapshot: StateSnapshot;
  isOrg: boolean;
  onOpen: (auctionPlayerId: string) => void;
}) {
  const { lots, auction, currentLot } = snapshot;
  const live = auction.status === "LIVE" || auction.status === "RE_AUCTION";
  const canOpen = live && !currentLot;
  const teamName = (tid: string | null) => snapshot.teams.find((t) => t.id === tid)?.name ?? "—";
  const c = lots.counts;

  const header = (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-slate-300">Lots</h3>
      <span className="text-xs text-slate-500">
        {c.PENDING} pending · {c.SOLD} sold · {c.UNSOLD} unsold · {c.ASSIGNED} assigned
      </span>
    </div>
  );

  const renderCards = (items: LiveLot[]) =>
    items.map((l, i) => (
      <PlayerCard
        key={l.auctionPlayerId}
        lot={l}
        index={i + 1}
        isOrg={isOrg}
        canOpen={canOpen}
        onOpen={onOpen}
        teamName={teamName}
      />
    ));

  if (auction.sport !== "CRICKET") {
    // Non-cricket auctions: one flat 3-column grid of player cards.
    return (
      <Card>
        {header}
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
          {renderCards(lots.items)}
        </div>
      </Card>
    );
  }

  const sections = CRICKET_SECTIONS.map((s) => ({
    ...s,
    items: lots.items.filter(s.match),
  })).filter((s) => s.items.length > 0);

  // Cricket players that don't match any section (e.g. missing role) still show.
  const matched = new Set(sections.flatMap((s) => s.items.map((l) => l.auctionPlayerId)));
  const others = lots.items.filter((l) => !matched.has(l.auctionPlayerId));
  if (others.length > 0) {
    sections.push({ key: "OTHER", label: "Unclassified", match: () => false, items: others });
  }

  // Each role section is a column in a 3-wide grid, wrapping to the next row.
  return (
    <Card>
      {header}
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
        {sections.map((s) => (
          <div key={s.key}>
            <div className="mb-1.5 flex items-center gap-1.5 border-b border-slate-800 pb-1">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {s.label}
              </h4>
              <span className="text-[10px] text-slate-600">{s.items.length}</span>
            </div>
            <div className="space-y-1">{renderCards(s.items)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Per-team roster grid: each team's won players (SOLD/ASSIGNED), derived from
 * lots' soldToTeamId. All teams shown; empty teams get a placeholder. */
function TeamRosters({
  teams,
  lots,
  myTeamId,
}: {
  teams: SnapshotTeam[];
  lots: LiveLot[];
  myTeamId: string | null;
}) {
  const rosterOf = (teamId: string) =>
    lots.filter(
      (l) => l.soldToTeamId === teamId && (l.status === "SOLD" || l.status === "ASSIGNED"),
    );
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-300">Team rosters</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {teams.map((t) => {
          const players = rosterOf(t.id);
          return (
            <div key={t.id} className="rounded-md border border-slate-800 p-2.5">
              <div className="mb-2 flex items-center gap-2 border-b border-slate-800 pb-1.5">
                {t.primaryColor && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: t.primaryColor }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {t.name}
                  {t.id === myTeamId && <span className="ml-1.5 text-xs text-indigo-400">you</span>}
                </span>
                <span className="shrink-0 text-[10px] text-slate-500">
                  {players.length} · {fmtCr(t.committedAmount)}
                </span>
              </div>
              {players.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-slate-600">No players yet</p>
              ) : (
                <div className="space-y-1">
                  {players.map((l, i) => (
                    <div key={l.auctionPlayerId} className="flex items-center gap-1.5">
                      <span className="w-3 shrink-0 text-right text-[10px] tabular-nums text-slate-500">
                        {i + 1}
                      </span>
                      <PlayerIcon name={l.playerName} photoUrl={l.photoUrl} />
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {l.playerName}
                        {l.isOverseas && (
                          <span className="ml-0.5 text-[10px] text-sky-400">✈</span>
                        )}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {fmtCr(l.soldPrice)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AssignmentPanel({
  room,
  snapshot,
  isOrg,
  myTeam,
}: {
  room: AuctionRoom;
  snapshot: StateSnapshot;
  isOrg: boolean;
  myTeam: SnapshotTeam | null;
}) {
  const { lots, teams, rules } = snapshot;
  const minP = rules?.minPlayersPerTeam ?? 0;
  const available = lots.items.filter((l) => l.status === "PENDING" || l.status === "UNSOLD");
  const [playerId, setPlayerId] = useState("");
  const [teamId, setTeamId] = useState(myTeam?.id ?? "");
  const targetTeam = isOrg ? teamId : myTeam?.id;

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-300">
        Assignment — fill teams to the minimum of {minP}
      </h3>
      <div className="mb-4 flex flex-wrap gap-2">
        {teams.map((t) => (
          <span
            key={t.id}
            className={`rounded px-2 py-0.5 text-xs ${
              t.playerCount < minP
                ? "bg-amber-500/15 text-amber-300"
                : "bg-emerald-500/15 text-emerald-300"
            }`}
          >
            {t.name}: {t.playerCount}/{minP}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block text-sm text-slate-300">Player</label>
          <Select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            <option value="">Select player…</option>
            {available.map((l) => (
              <option key={l.auctionPlayerId} value={l.auctionPlayerId}>
                {l.playerName} ({l.status})
              </option>
            ))}
          </Select>
        </div>
        {isOrg && (
          <div className="space-y-1">
            <label className="block text-sm text-slate-300">Team</label>
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Select team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.playerCount}/{minP})
                </option>
              ))}
            </Select>
          </div>
        )}
        <Button
          disabled={!playerId || !targetTeam}
          onClick={() => targetTeam && room.assignPlayer(playerId, targetTeam)}
        >
          {isOrg ? "Force-assign" : "Choose"} at {fmtCr(rules?.unsoldPrice)}
        </Button>
      </div>
      {available.length === 0 && (
        <p className="mt-3 text-sm text-slate-400">No remaining players to assign.</p>
      )}
    </Card>
  );
}
