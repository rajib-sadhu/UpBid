import { useCallback, useEffect, useRef, useState } from "react";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type StateSnapshot,
  type SnapshotTeam,
  type LiveLot,
  type LotCounts,
  type CurrentLot,
  type TeamTally,
  type PhaseTarget,
  type BidAcceptedEvent,
  type BidRejectedEvent,
  type LotOpenedEvent,
  type LotTimerExpiredEvent,
  type LotSoldEvent,
  type LotUnsoldEvent,
  type PlayerAssignedEvent,
  type TimerPausedEvent,
  type TimerResumedEvent,
  type PhaseChangedEvent,
  type SocketErrorEvent,
} from "shared";
import { getSocket } from "./socket.js";

export type ConnState = "connecting" | "connected" | "disconnected";

export interface AuctionRoom {
  snapshot: StateSnapshot | null;
  conn: ConnState;
  /** Last bid rejection (for the current user), surfaced for inline feedback. */
  lastReject: BidRejectedEvent | null;
  lastError: SocketErrorEvent | null;
  // Actions (organizer / franchise depending on role + mode; server re-checks).
  placeBid: (lot: CurrentLot, teamId: string) => void;
  openLot: (auctionPlayerId: string) => void;
  sellLot: (auctionPlayerId: string) => void;
  markUnsold: (auctionPlayerId: string) => void;
  addTime: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  advancePhase: (to: PhaseTarget) => void;
  assignPlayer: (auctionPlayerId: string, teamId: string) => void;
}

function applyTally(teams: SnapshotTeam[], tally: TeamTally): SnapshotTeam[] {
  return teams.map((t) =>
    t.id === tally.id
      ? {
          ...t,
          committedAmount: tally.committedAmount,
          playerCount: tally.playerCount,
          maxBid: tally.maxBid,
        }
      : t,
  );
}

function replaceLot(items: LiveLot[], lot: LiveLot): LiveLot[] {
  return items.map((l) => (l.auctionPlayerId === lot.auctionPlayerId ? lot : l));
}

function setLotStatus(
  items: LiveLot[],
  auctionPlayerId: string,
  status: LiveLot["status"],
): LiveLot[] {
  return items.map((l) => (l.auctionPlayerId === auctionPlayerId ? { ...l, status } : l));
}

function recount(items: LiveLot[]): LotCounts {
  const c: LotCounts = { PENDING: 0, ON_BLOCK: 0, SOLD: 0, UNSOLD: 0, ASSIGNED: 0 };
  for (const l of items) c[l.status] += 1;
  return c;
}

export function useAuctionRoom(auctionId: string | undefined): AuctionRoom {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [lastReject, setLastReject] = useState<BidRejectedEvent | null>(null);
  const [lastError, setLastError] = useState<SocketErrorEvent | null>(null);
  const seqRef = useRef(0);

  const join = useCallback(() => {
    if (auctionId) getSocket().emit(CLIENT_EVENTS.AUCTION_JOIN, { auctionId });
  }, [auctionId]);

  useEffect(() => {
    if (!auctionId) return;
    const socket = getSocket();

    // Apply a delta only if it's the next in sequence; otherwise re-snapshot.
    const onDelta = <T extends { seq: number }>(
      ev: T,
      reduce: (s: StateSnapshot) => StateSnapshot,
    ) => {
      if (ev.seq !== seqRef.current + 1) {
        join(); // gap detected → force a fresh snapshot
        return;
      }
      seqRef.current = ev.seq;
      setSnapshot((s) => (s ? reduce({ ...s, seq: ev.seq }) : s));
    };

    const handlers: Record<string, (ev: never) => void> = {
      [SERVER_EVENTS.STATE_SNAPSHOT]: (snap: StateSnapshot) => {
        seqRef.current = snap.seq;
        setSnapshot(snap);
      },
      [SERVER_EVENTS.BID_ACCEPTED]: (ev: BidAcceptedEvent) =>
        onDelta(ev, (s) => ({
          ...s,
          teams: applyTally(s.teams, ev.team),
          currentLot:
            s.currentLot && s.currentLot.auctionPlayerId === ev.auctionPlayerId
              ? {
                  ...s.currentLot,
                  currentPrice: ev.currentPrice,
                  leadingTeamId: ev.leadingTeamId,
                  version: ev.version,
                  requiredNextBid: ev.requiredNextBid,
                  endsAt: ev.endsAt,
                  timerState: "BIDDING",
                }
              : s.currentLot,
        })),
      [SERVER_EVENTS.BID_REJECTED]: (ev: BidRejectedEvent) => setLastReject(ev),
      [SERVER_EVENTS.LOT_OPENED]: (ev: LotOpenedEvent) =>
        onDelta(ev, (s) => {
          const items = setLotStatus(s.lots.items, ev.currentLot.auctionPlayerId, "ON_BLOCK");
          return { ...s, currentLot: ev.currentLot, lots: { counts: recount(items), items } };
        }),
      [SERVER_EVENTS.LOT_TIMER_EXPIRED]: (ev: LotTimerExpiredEvent) =>
        onDelta(ev, (s) => ({
          ...s,
          currentLot:
            s.currentLot && s.currentLot.auctionPlayerId === ev.auctionPlayerId
              ? { ...s.currentLot, timerState: "FROZEN", endsAt: null }
              : s.currentLot,
        })),
      [SERVER_EVENTS.LOT_SOLD]: (ev: LotSoldEvent) =>
        onDelta(ev, (s) => {
          const items = replaceLot(s.lots.items, ev.lot);
          return {
            ...s,
            currentLot: null,
            teams: applyTally(s.teams, ev.team),
            lots: { counts: ev.lotCounts, items },
          };
        }),
      [SERVER_EVENTS.LOT_UNSOLD]: (ev: LotUnsoldEvent) =>
        onDelta(ev, (s) => {
          const items = replaceLot(s.lots.items, ev.lot);
          return { ...s, currentLot: null, lots: { counts: ev.lotCounts, items } };
        }),
      [SERVER_EVENTS.PLAYER_ASSIGNED]: (ev: PlayerAssignedEvent) =>
        onDelta(ev, (s) => {
          const items = replaceLot(s.lots.items, ev.lot);
          return {
            ...s,
            teams: applyTally(s.teams, ev.team),
            lots: { counts: ev.lotCounts, items },
          };
        }),
      [SERVER_EVENTS.TIMER_PAUSED]: (ev: TimerPausedEvent) =>
        onDelta(ev, (s) => ({
          ...s,
          currentLot: s.currentLot
            ? { ...s.currentLot, timerState: "PAUSED", endsAt: null, remainingMs: ev.remainingMs }
            : s.currentLot,
        })),
      [SERVER_EVENTS.TIMER_RESUMED]: (ev: TimerResumedEvent) =>
        onDelta(ev, (s) => ({
          ...s,
          currentLot: s.currentLot
            ? { ...s.currentLot, timerState: "BIDDING", endsAt: ev.endsAt, remainingMs: null }
            : s.currentLot,
        })),
      [SERVER_EVENTS.PHASE_CHANGED]: (ev: PhaseChangedEvent) =>
        onDelta(ev, (s) => ({
          ...s,
          auction: { ...s.auction, status: ev.status, round: ev.round },
        })),
      [SERVER_EVENTS.ERROR]: (ev: SocketErrorEvent) => setLastError(ev),
    };

    const onConnect = () => {
      setConn("connected");
      join();
    };
    const onDisconnect = () => setConn("disconnected");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    for (const [event, fn] of Object.entries(handlers)) {
      socket.on(event, fn as (payload: unknown) => void);
    }

    if (socket.connected) onConnect();
    else socket.connect();

    return () => {
      socket.emit(CLIENT_EVENTS.AUCTION_LEAVE, { auctionId });
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      for (const [event, fn] of Object.entries(handlers)) {
        socket.off(event, fn as (payload: unknown) => void);
      }
    };
  }, [auctionId, join]);

  const emit = useCallback((event: string, payload: unknown) => {
    getSocket().emit(event, payload);
  }, []);

  const placeBid = useCallback(
    (lot: CurrentLot, teamId: string) => {
      if (!auctionId) return;
      setLastReject(null);
      emit(CLIENT_EVENTS.BID_PLACE, {
        auctionId,
        auctionPlayerId: lot.auctionPlayerId,
        teamId,
        amount: lot.requiredNextBid,
        version: lot.version,
        clientBidId: crypto.randomUUID(),
      });
    },
    [auctionId, emit],
  );

  const lotAction = useCallback(
    (event: string, auctionPlayerId: string) => {
      if (auctionId) emit(event, { auctionId, auctionPlayerId });
    },
    [auctionId, emit],
  );

  return {
    snapshot,
    conn,
    lastReject,
    lastError,
    placeBid,
    openLot: (id) => lotAction(CLIENT_EVENTS.LOT_OPEN, id),
    sellLot: (id) => lotAction(CLIENT_EVENTS.LOT_SELL, id),
    markUnsold: (id) => lotAction(CLIENT_EVENTS.LOT_MARK_UNSOLD, id),
    addTime: (seconds) => auctionId && emit(CLIENT_EVENTS.TIMER_ADD, { auctionId, seconds }),
    pause: () => auctionId && emit(CLIENT_EVENTS.TIMER_PAUSE, { auctionId }),
    resume: () => auctionId && emit(CLIENT_EVENTS.TIMER_RESUME, { auctionId }),
    advancePhase: (to) => auctionId && emit(CLIENT_EVENTS.PHASE_ADVANCE, { auctionId, to }),
    assignPlayer: (auctionPlayerId, teamId) =>
      auctionId && emit(CLIENT_EVENTS.ASSIGN_PLAYER, { auctionId, auctionPlayerId, teamId }),
  };
}
