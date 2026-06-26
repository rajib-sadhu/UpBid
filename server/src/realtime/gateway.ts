import type { Server, Socket } from "socket.io";
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  auctionIdSchema,
  lotRefSchema,
  bidPlaceSchema,
  timerAddSchema,
  phaseAdvanceSchema,
  assignPlayerSchema,
} from "shared";
import type { ZodSchema } from "zod";
import type { AuthUser } from "../auth/types.js";
import { verifyToken } from "../auth/jwt.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import {
  initBroadcast,
  emitToRoom,
  emitToSocket,
  roomName,
  nextSeq,
  currentSeq,
} from "./broadcast.js";
import { canViewAuction, requireOrganizer } from "./authz.js";
import { buildStateSnapshot } from "./snapshot.js";
import * as timer from "./timer.js";
import { placeBid } from "../services/bid-pipeline.js";
import { openLot } from "../services/lot.js";
import { finalizeLot } from "../services/finalize.js";
import { assignPlayer } from "../services/assignment.js";
import { advancePhase } from "../services/phase.js";

// Bid-pipeline outcomes that are normal race results → BID_REJECTED (to the one
// bidder), not protocol faults. Everything else (FORBIDDEN, NOT_FOUND, …) → ERROR.
const REJECT_CODES = new Set([
  "LOT_NOT_LIVE",
  "BAD_AMOUNT",
  "TEAM_FULL",
  "RESERVE_EXCEEDED",
  "OUTBID",
  "STALE_VERSION",
  "DUPLICATE_BID",
]);

function emitError(socket: Socket, err: unknown): void {
  if (err instanceof AppError) {
    emitToSocket(socket, SERVER_EVENTS.ERROR, { code: err.code, message: err.message });
  } else {
    console.error("[socket] handler error:", err);
    emitToSocket(socket, SERVER_EVENTS.ERROR, { code: "INTERNAL", message: "Unexpected error" });
  }
}

/** Resolve the bidding status to restore on resume/add-time (round-aware). */
async function biddingStatus(auctionId: string): Promise<"LIVE" | "RE_AUCTION"> {
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { round: true },
  });
  return a?.round === "RE_AUCTION" ? "RE_AUCTION" : "LIVE";
}

/** The id of the lot currently on the block, or throw if none. */
async function requireCurrentLot(auctionId: string): Promise<string> {
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { currentAuctionPlayerId: true },
  });
  if (!a?.currentAuctionPlayerId)
    throw new AppError("INVALID_STATE", "No lot is on the block", 409);
  return a.currentAuctionPlayerId;
}

/** Register a validated, error-wrapped client→server handler. */
function on<T>(
  socket: Socket,
  event: string,
  schema: ZodSchema<T>,
  handler: (payload: T) => Promise<void>,
): void {
  socket.on(event, (raw: unknown) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      emitToSocket(socket, SERVER_EVENTS.ERROR, {
        code: "VALIDATION_ERROR",
        message: "Invalid event payload",
      });
      return;
    }
    handler(parsed.data).catch((err) => emitError(socket, err));
  });
}

export function initGateway(io: Server): void {
  initBroadcast(io);
  timer.startSweep();

  // Re-arm / freeze any in-flight lots left by a previous process.
  void recoverActiveTimers().catch((e) => console.error("[realtime] timer recovery failed:", e));

  // Handshake auth: verify the JWT and attach the user (architecture.md §3).
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error("UNAUTHENTICATED"));
      return;
    }
    try {
      const payload = verifyToken(token);
      socket.data.user = { id: payload.sub, role: payload.role } satisfies AuthUser;
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as AuthUser;

    // ---- Join / leave -----------------------------------------------------
    on(socket, CLIENT_EVENTS.AUCTION_JOIN, auctionIdSchema, async ({ auctionId }) => {
      if (!(await canViewAuction(user, auctionId))) {
        throw new AppError("FORBIDDEN", "You cannot view this auction", 403);
      }
      await socket.join(roomName(auctionId));
      emitToSocket(socket, SERVER_EVENTS.STATE_SNAPSHOT, await buildStateSnapshot(auctionId));
    });

    on(socket, CLIENT_EVENTS.AUCTION_LEAVE, auctionIdSchema, async ({ auctionId }) => {
      await socket.leave(roomName(auctionId));
    });

    // ---- Bidding ----------------------------------------------------------
    socket.on(CLIENT_EVENTS.BID_PLACE, (raw: unknown) => {
      const parsed = bidPlaceSchema.safeParse(raw);
      if (!parsed.success) {
        emitToSocket(socket, SERVER_EVENTS.ERROR, {
          code: "VALIDATION_ERROR",
          message: "Invalid bid payload",
        });
        return;
      }
      const p = parsed.data;
      placeBid(user, p)
        .then((accepted) => {
          emitToRoom(p.auctionId, SERVER_EVENTS.BID_ACCEPTED, {
            seq: nextSeq(p.auctionId),
            ...accepted,
          });
        })
        .catch((err) => {
          if (err instanceof AppError && REJECT_CODES.has(err.code)) {
            emitToSocket(socket, SERVER_EVENTS.BID_REJECTED, {
              seq: currentSeq(p.auctionId),
              clientBidId: p.clientBidId,
              code: err.code,
              message: err.message,
            });
          } else {
            emitError(socket, err);
          }
        });
    });

    // ---- Organizer lot control -------------------------------------------
    on(socket, CLIENT_EVENTS.LOT_OPEN, lotRefSchema, async ({ auctionId, auctionPlayerId }) => {
      await requireOrganizer(user, auctionId);
      const { currentLot, endsAt } = await openLot(auctionId, auctionPlayerId);
      timer.armBidding(auctionId, auctionPlayerId, endsAt);
      emitToRoom(auctionId, SERVER_EVENTS.LOT_OPENED, { seq: nextSeq(auctionId), currentLot });
    });

    on(socket, CLIENT_EVENTS.LOT_SELL, lotRefSchema, async ({ auctionId, auctionPlayerId }) => {
      await requireOrganizer(user, auctionId);
      const result = await finalizeLot(auctionId, auctionPlayerId, "SELL");
      emitToRoom(auctionId, SERVER_EVENTS.LOT_SOLD, { seq: nextSeq(auctionId), ...result.payload });
    });

    on(
      socket,
      CLIENT_EVENTS.LOT_MARK_UNSOLD,
      lotRefSchema,
      async ({ auctionId, auctionPlayerId }) => {
        await requireOrganizer(user, auctionId);
        const result = await finalizeLot(auctionId, auctionPlayerId, "UNSOLD");
        emitToRoom(auctionId, SERVER_EVENTS.LOT_UNSOLD, {
          seq: nextSeq(auctionId),
          ...result.payload,
        });
      },
    );

    // ---- Organizer timer control -----------------------------------------
    on(socket, CLIENT_EVENTS.TIMER_ADD, timerAddSchema, async ({ auctionId, seconds }) => {
      await requireOrganizer(user, auctionId);
      const lotId = await requireCurrentLot(auctionId);
      const endsAt = timer.addTime(auctionId, lotId, seconds);
      await prisma.auction.update({
        where: { id: auctionId },
        data: { status: await biddingStatus(auctionId), currentLotEndsAt: endsAt },
      });
      emitToRoom(auctionId, SERVER_EVENTS.TIMER_RESUMED, {
        seq: nextSeq(auctionId),
        auctionPlayerId: lotId,
        endsAt: endsAt.toISOString(),
      });
    });

    on(socket, CLIENT_EVENTS.TIMER_PAUSE, auctionIdSchema, async ({ auctionId }) => {
      await requireOrganizer(user, auctionId);
      const lotId = await requireCurrentLot(auctionId);
      const remainingMs = timer.pause(auctionId);
      await prisma.auction.update({
        where: { id: auctionId },
        data: { status: "PAUSED", currentLotEndsAt: null },
      });
      emitToRoom(auctionId, SERVER_EVENTS.TIMER_PAUSED, {
        seq: nextSeq(auctionId),
        auctionPlayerId: lotId,
        remainingMs,
      });
    });

    on(socket, CLIENT_EVENTS.TIMER_RESUME, auctionIdSchema, async ({ auctionId }) => {
      await requireOrganizer(user, auctionId);
      const lotId = await requireCurrentLot(auctionId);
      const rules = await prisma.auctionRules.findUnique({
        where: { auctionId },
        select: { defaultLotDurationSec: true },
      });
      const endsAt = timer.resume(auctionId, lotId, (rules?.defaultLotDurationSec ?? 30) * 1000);
      await prisma.auction.update({
        where: { id: auctionId },
        data: { status: await biddingStatus(auctionId), currentLotEndsAt: endsAt },
      });
      emitToRoom(auctionId, SERVER_EVENTS.TIMER_RESUMED, {
        seq: nextSeq(auctionId),
        auctionPlayerId: lotId,
        endsAt: endsAt.toISOString(),
      });
    });

    // ---- Phase + assignment ----------------------------------------------
    on(socket, CLIENT_EVENTS.PHASE_ADVANCE, phaseAdvanceSchema, async ({ auctionId, to }) => {
      await requireOrganizer(user, auctionId);
      const result = await advancePhase(auctionId, to);
      emitToRoom(auctionId, SERVER_EVENTS.PHASE_CHANGED, { seq: nextSeq(auctionId), ...result });
    });

    on(socket, CLIENT_EVENTS.ASSIGN_PLAYER, assignPlayerSchema, async (payload) => {
      // AuthZ is inside assignPlayer (organizer force vs franchise choose).
      const result = await assignPlayer(user, payload);
      emitToRoom(payload.auctionId, SERVER_EVENTS.PLAYER_ASSIGNED, {
        seq: nextSeq(payload.auctionId),
        ...result,
      });
    });
  });
}

/** On boot, re-arm live lot timers / freeze elapsed ones (crash recovery). */
async function recoverActiveTimers(): Promise<void> {
  const active = await prisma.auction.findMany({
    where: {
      status: { in: ["LIVE", "RE_AUCTION", "PAUSED"] },
      currentAuctionPlayerId: { not: null },
    },
  });
  for (const auction of active) timer.resolveInfo(auction);
}
