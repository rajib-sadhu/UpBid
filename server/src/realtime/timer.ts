import type { Auction } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { nextSeq, emitToRoom } from "./broadcast.js";
import { SERVER_EVENTS, type TimerState } from "shared";

// ===========================================================================
// Server-authoritative lot timer (docs/architecture.md §7), FREEZE-on-expiry:
// when the clock hits zero the lot is NOT finalized and the auction does NOT
// auto-advance — the lot freezes and the organizer takes over (sell / unsold /
// add-time). Finalize is always an explicit organizer action.
//
// The in-memory registry is the fast path; Auction.currentLotEndsAt +
// Auction.status make it crash-safe (a sweep / snapshot re-derives state after
// a restart). No anti-snipe: endsAt is set at open and only changed by an
// explicit add-time / pause-resume.
// ===========================================================================

interface TimerEntry {
  auctionPlayerId: string;
  state: TimerState;
  timeout: NodeJS.Timeout | null;
  /** epoch ms when the lot expires (only meaningful while BIDDING). */
  endsAtMs: number | null;
  /** ms left, captured on PAUSE (only meaningful while PAUSED). */
  remainingMs: number | null;
}

const timers = new Map<string, TimerEntry>();

export interface TimerInfo {
  state: TimerState;
  endsAt: Date | null;
  remainingMs: number | null;
}

function clearHandle(entry: TimerEntry | undefined): void {
  if (entry?.timeout) clearTimeout(entry.timeout);
}

/** Arm (or re-arm) the BIDDING countdown for a lot; fires freeze() at endsAt. */
export function armBidding(auctionId: string, auctionPlayerId: string, endsAt: Date): void {
  clearHandle(timers.get(auctionId));
  const ms = Math.max(0, endsAt.getTime() - Date.now());
  const timeout = setTimeout(() => {
    void freeze(auctionId, auctionPlayerId);
  }, ms);
  timers.set(auctionId, {
    auctionPlayerId,
    state: "BIDDING",
    timeout,
    endsAtMs: endsAt.getTime(),
    remainingMs: null,
  });
}

/** Timer hit zero → freeze the lot (no finalize, no advance) and broadcast. */
async function freeze(auctionId: string, auctionPlayerId: string): Promise<void> {
  const entry = timers.get(auctionId);
  if (!entry || entry.auctionPlayerId !== auctionPlayerId || entry.state !== "BIDDING") return;
  entry.state = "FROZEN";
  entry.timeout = null;
  entry.endsAtMs = null;
  await prisma.auction.update({ where: { id: auctionId }, data: { currentLotEndsAt: null } });
  emitToRoom(auctionId, SERVER_EVENTS.LOT_TIMER_EXPIRED, {
    seq: nextSeq(auctionId),
    auctionPlayerId,
  });
}

/** Drop the timer for an auction (called on finalize / lot close). */
export function stop(auctionId: string): void {
  clearHandle(timers.get(auctionId));
  timers.delete(auctionId);
}

/** Organizer pause during active bidding: store remaining time, clear the clock. */
export function pause(auctionId: string): number {
  const entry = timers.get(auctionId);
  const remainingMs = entry?.endsAtMs != null ? Math.max(0, entry.endsAtMs - Date.now()) : 0;
  clearHandle(entry);
  if (entry) {
    entry.state = "PAUSED";
    entry.timeout = null;
    entry.endsAtMs = null;
    entry.remainingMs = remainingMs;
  }
  return remainingMs;
}

/** Resume a paused lot with the stored remaining time; returns the new endsAt. */
export function resume(auctionId: string, auctionPlayerId: string, fallbackMs: number): Date {
  const entry = timers.get(auctionId);
  const remainingMs = entry?.remainingMs ?? fallbackMs;
  const endsAt = new Date(Date.now() + remainingMs);
  armBidding(auctionId, auctionPlayerId, endsAt);
  return endsAt;
}

/** Add time (also reopens a FROZEN lot for bidding); returns the new endsAt. */
export function addTime(auctionId: string, auctionPlayerId: string, seconds: number): Date {
  const endsAt = new Date(Date.now() + seconds * 1000);
  armBidding(auctionId, auctionPlayerId, endsAt);
  return endsAt;
}

/**
 * Resolve the live timer state for a lot, re-deriving + re-arming from the DB
 * when the in-memory entry is missing (e.g. after a process restart). Used by
 * the snapshot builder. `auction` must be the current row for this auctionId.
 */
export function resolveInfo(auction: Auction): TimerInfo {
  const lotId = auction.currentAuctionPlayerId;
  if (!lotId) return { state: "BIDDING", endsAt: null, remainingMs: null };

  const entry = timers.get(auction.id);
  if (entry && entry.auctionPlayerId === lotId) {
    return {
      state: entry.state,
      endsAt: entry.state === "BIDDING" && entry.endsAtMs != null ? new Date(entry.endsAtMs) : null,
      remainingMs: entry.state === "PAUSED" ? entry.remainingMs : null,
    };
  }

  // No live entry — derive from persisted state (crash recovery).
  if (auction.status === "PAUSED") {
    return { state: "PAUSED", endsAt: null, remainingMs: 0 };
  }
  const endsAt = auction.currentLotEndsAt;
  if (endsAt && endsAt.getTime() > Date.now()) {
    armBidding(auction.id, lotId, endsAt); // re-arm the lost timeout
    return { state: "BIDDING", endsAt, remainingMs: null };
  }
  // Elapsed but never frozen (timeout lost in a restart) → frozen now.
  timers.set(auction.id, {
    auctionPlayerId: lotId,
    state: "FROZEN",
    timeout: null,
    endsAtMs: null,
    remainingMs: null,
  });
  return { state: "FROZEN", endsAt: null, remainingMs: null };
}

/**
 * Crash-safe sweep: freeze any lot whose endsAt has elapsed but whose timeout
 * was lost (e.g. restart). Never finalizes — consistent with the freeze rule.
 * Runs on an interval started at bootstrap.
 */
export async function sweepExpired(): Promise<void> {
  const now = new Date();
  const stale = await prisma.auction.findMany({
    where: {
      status: { in: ["LIVE", "RE_AUCTION"] },
      currentAuctionPlayerId: { not: null },
      currentLotEndsAt: { not: null, lte: now },
    },
    select: { id: true, currentAuctionPlayerId: true },
  });
  for (const a of stale) {
    const entry = timers.get(a.id);
    if (entry?.state === "FROZEN") continue;
    await prisma.auction.update({ where: { id: a.id }, data: { currentLotEndsAt: null } });
    timers.set(a.id, {
      auctionPlayerId: a.currentAuctionPlayerId!,
      state: "FROZEN",
      timeout: null,
      endsAtMs: null,
      remainingMs: null,
    });
    emitToRoom(a.id, SERVER_EVENTS.LOT_TIMER_EXPIRED, {
      seq: nextSeq(a.id),
      auctionPlayerId: a.currentAuctionPlayerId,
    });
  }
}

let sweepHandle: NodeJS.Timeout | null = null;
export function startSweep(intervalMs = 5000): void {
  if (sweepHandle) return;
  sweepHandle = setInterval(() => {
    void sweepExpired().catch((e) => console.error("[timer] sweep failed:", e));
  }, intervalMs);
  // Don't keep the event loop alive solely for the sweep.
  sweepHandle.unref?.();
}
