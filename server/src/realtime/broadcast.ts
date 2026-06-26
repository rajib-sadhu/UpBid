import type { Server, Socket } from "socket.io";

// Low-level room broadcast + per-auction sequence numbers. The `io` instance is
// injected once at bootstrap so services/handlers can emit without importing the
// HTTP server. Single-instance for now; on a Redis-adapter deployment the seq
// counter must move to a Redis INCR (flagged in docs/architecture.md §4.1).

let io: Server | null = null;
const seqByAuction = new Map<string, number>();

export function initBroadcast(server: Server): void {
  io = server;
}

export function roomName(auctionId: string): string {
  return `auction:${auctionId}`;
}

/** Current seq without advancing — used when building a STATE_SNAPSHOT. */
export function currentSeq(auctionId: string): number {
  return seqByAuction.get(auctionId) ?? 0;
}

/** Advance and return the next seq — used for every room delta broadcast. */
export function nextSeq(auctionId: string): number {
  const n = currentSeq(auctionId) + 1;
  seqByAuction.set(auctionId, n);
  return n;
}

/** Broadcast a server event to everyone in the auction room. */
export function emitToRoom(auctionId: string, event: string, payload: unknown): void {
  io?.to(roomName(auctionId)).emit(event, payload);
}

/** Emit a server event to a single socket (snapshots, rejections, errors). */
export function emitToSocket(socket: Socket, event: string, payload: unknown): void {
  socket.emit(event, payload);
}
