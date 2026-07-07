import type { Socket } from "socket.io";
import { SERVER_EVENTS } from "shared";

// ===========================================================================
// Room presence + connection quality. Every socket that joins an auction room
// is pinged every few seconds (Socket.io ack round-trip = the user's latency).
// The per-user results go ONLY to that auction's organizer/admin sockets — the
// live page renders them as signal bars next to each franchise. Display-only,
// in-memory, no seq: a restart simply starts measuring again.
// ===========================================================================

interface Tracked {
  socket: Socket;
  userId: string;
  /** May this socket receive other users' connection reports? */
  observer: boolean;
  rttMs: number | null;
}

const byAuction = new Map<string, Map<string, Tracked>>(); // auctionId → socketId

const PING_EVERY_MS = 5_000;
const PING_TIMEOUT_MS = 4_000;

export function trackPresence(
  auctionId: string,
  socket: Socket,
  userId: string,
  observer: boolean,
): void {
  let room = byAuction.get(auctionId);
  if (!room) {
    room = new Map();
    byAuction.set(auctionId, room);
  }
  room.set(socket.id, { socket, userId, observer, rttMs: null });
}

export function untrackPresence(auctionId: string, socket: Socket): void {
  const room = byAuction.get(auctionId);
  if (!room) return;
  room.delete(socket.id);
  if (room.size === 0) byAuction.delete(auctionId);
}

/** Remove a disconnected socket from every auction it was tracked in. */
export function untrackEverywhere(socket: Socket): void {
  for (const [auctionId, room] of byAuction) {
    room.delete(socket.id);
    if (room.size === 0) byAuction.delete(auctionId);
  }
}

/** Connected users' best RTT for an auction (null = not measured yet). */
export function presenceForAuction(auctionId: string): Record<string, number | null> {
  const users: Record<string, number | null> = {};
  const room = byAuction.get(auctionId);
  if (!room) return users;
  for (const e of room.values()) {
    if (!(e.userId in users)) {
      users[e.userId] = e.rttMs;
    } else {
      const prev = users[e.userId];
      if (e.rttMs != null && (prev == null || e.rttMs < prev)) users[e.userId] = e.rttMs;
    }
  }
  return users;
}

/** Start the measure/report cycle. Called once from the gateway. */
export function startPresenceLoop(): void {
  const timer = setInterval(() => {
    for (const [auctionId, room] of byAuction) {
      // Report the previous tick's measurements to the observers…
      const users = presenceForAuction(auctionId);
      for (const e of room.values()) {
        if (e.observer) e.socket.emit(SERVER_EVENTS.PRESENCE, { users });
      }
      // …then refresh every socket's RTT for the next tick.
      for (const e of room.values()) {
        const start = Date.now();
        e.socket.timeout(PING_TIMEOUT_MS).emit(SERVER_EVENTS.PRESENCE_PING, (err: unknown) => {
          e.rttMs = err ? null : Date.now() - start;
        });
      }
    }
  }, PING_EVERY_MS);
  timer.unref(); // never keep the process alive just for pings
}
