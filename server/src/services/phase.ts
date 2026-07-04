import type { PhaseChangedEvent, PhaseTarget } from "shared";
import { prisma } from "../lib/prisma.js";
import { Errors, AppError } from "../lib/errors.js";
import * as timer from "../realtime/timer.js";

/**
 * Organizer-driven auction state-machine transitions (architecture.md §9):
 *   LIVE → RE_AUCTION → ASSIGNMENT → COMPLETED.
 * DRAFT→LIVE is the REST go-live; LIVE⇄PAUSED is the timer pause overlay.
 */
export async function advancePhase(
  auctionId: string,
  to: PhaseTarget,
): Promise<Omit<PhaseChangedEvent, "seq">> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { status: true, round: true, currentAuctionPlayerId: true },
  });
  if (!auction) throw Errors.notFound("Auction not found");

  // No transition may run with a lot still on the block.
  if (auction.currentAuctionPlayerId) {
    throw Errors.invalidState("Finalize the current lot before changing phase");
  }

  if (to === "RE_AUCTION") {
    if (auction.status !== "LIVE") {
      throw Errors.invalidState("Re-auction can only start from the live main round");
    }
    await prisma.$transaction([
      // Reset main-round unsold lots in place for the re-auction round.
      prisma.auctionPlayer.updateMany({
        where: { auctionId, status: "UNSOLD", round: "MAIN" },
        data: { status: "PENDING", round: "RE_AUCTION", currentPrice: null, leadingTeamId: null },
      }),
      prisma.auction.update({
        where: { id: auctionId },
        data: { status: "RE_AUCTION", round: "RE_AUCTION" },
      }),
    ]);
  } else if (to === "ASSIGNMENT") {
    if (auction.status !== "LIVE" && auction.status !== "RE_AUCTION") {
      throw Errors.invalidState("Assignment can only start from a live round");
    }
    await prisma.auction.update({
      where: { id: auctionId },
      data: { status: "ASSIGNMENT", round: "ASSIGNMENT" },
    });
  } else {
    // COMPLETED — gated on every team meeting its minimum.
    if (auction.status !== "ASSIGNMENT") {
      throw Errors.invalidState("Complete the auction from the assignment phase");
    }
    const rules = await prisma.auctionRules.findUnique({ where: { auctionId } });
    if (!rules) throw Errors.invalidState("Auction has no rules configured");
    const short = await prisma.team.findFirst({
      where: { auctionId, playerCount: { lt: rules.minPlayersPerTeam } },
      select: { playerCount: true, franchise: { select: { name: true } } },
    });
    if (short) {
      throw new AppError(
        "MIN_NOT_MET",
        `Team "${short.franchise.name}" has ${short.playerCount} players, below the minimum of ${rules.minPlayersPerTeam}`,
        409,
      );
    }
    await prisma.auction.update({ where: { id: auctionId }, data: { status: "COMPLETED" } });
  }

  timer.stop(auctionId);
  const updated = await prisma.auction.findUniqueOrThrow({
    where: { id: auctionId },
    select: { status: true, round: true },
  });
  return { status: updated.status, round: updated.round };
}

/**
 * Suspend a live auction (whole-auction pause, distinct from the per-lot timer
 * pause). Requires an empty block — finalize the current lot first — so a resume
 * always re-enters cleanly between lots. The round is preserved; resume reads it
 * back. Caller rebroadcasts a fresh snapshot.
 */
export async function suspendAuction(auctionId: string): Promise<void> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { status: true, currentAuctionPlayerId: true },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  if (auction.status !== "LIVE" && auction.status !== "RE_AUCTION") {
    throw Errors.invalidState("Only a live auction can be suspended");
  }
  if (auction.currentAuctionPlayerId) {
    throw Errors.invalidState("Finalize the current lot before suspending the auction");
  }
  await prisma.auction.update({
    where: { id: auctionId },
    data: { status: "SUSPENDED", currentLotEndsAt: null, autoPilot: false },
  });
  timer.stop(auctionId);
}

/**
 * Resume a suspended auction back to its live round (LIVE for a MAIN round,
 * RE_AUCTION for a re-auction round). No lot is on the block, so no timer is
 * armed — the organizer opens the next lot. Caller rebroadcasts a snapshot.
 */
export async function resumeAuction(auctionId: string): Promise<void> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { status: true, round: true },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  if (auction.status !== "SUSPENDED") {
    throw Errors.invalidState("Only a suspended auction can be resumed");
  }
  await prisma.auction.update({
    where: { id: auctionId },
    data: { status: auction.round === "RE_AUCTION" ? "RE_AUCTION" : "LIVE" },
  });
}

/**
 * Cancel (abandon) an auction. Soft: the auction is marked CANCELLED and dropped
 * from the live/active lists, but all records — teams, bids, sales — are kept for
 * history. Any lot on the block is cleared and the timer stopped. Terminal;
 * cannot be reversed through the normal flow. Caller rebroadcasts a snapshot.
 */
export async function cancelAuction(auctionId: string): Promise<void> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { status: true },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  if (auction.status === "COMPLETED" || auction.status === "CANCELLED") {
    throw Errors.invalidState("This auction is already finished");
  }
  if (auction.status === "DRAFT") {
    throw Errors.invalidState("Delete a draft auction instead of cancelling it");
  }
  await prisma.auction.update({
    where: { id: auctionId },
    data: {
      status: "CANCELLED",
      currentAuctionPlayerId: null,
      currentLotEndsAt: null,
      autoPilot: false,
    },
  });
  timer.stop(auctionId);
}
