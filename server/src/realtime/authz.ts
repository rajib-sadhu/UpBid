import type { AuthUser } from "../auth/types.js";
import { prisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";

// Authorization for the real-time layer. Mirrors the REST guards: SUPER_ADMIN is
// god-mode, the organizer owns auctions beneath their leagues, a franchise owns
// the team it was assigned. Every action re-checks server-side (never trusts the
// join check alone). See docs/architecture.md §3.

/** Owner (organizer) of an auction = the organizer of its league. */
export async function auctionOwnerId(auctionId: string): Promise<string | null> {
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { season: { select: { league: { select: { organizerId: true } } } } },
  });
  return a?.season.league.organizerId ?? null;
}

/** True if the user may view (join) the auction room. */
export async function canViewAuction(user: AuthUser, auctionId: string): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "ORGANIZER") return (await auctionOwnerId(auctionId)) === user.id;
  // FRANCHISE: must own a participating franchise's team in this auction.
  const team = await prisma.team.findFirst({
    where: { auctionId, franchise: { ownerUserId: user.id } },
    select: { id: true },
  });
  return team !== null;
}

/** Assert the user controls the auction (organizer-owner or super-admin). */
export async function requireOrganizer(user: AuthUser, auctionId: string): Promise<void> {
  if (user.role === "SUPER_ADMIN") return;
  const ownerId = await auctionOwnerId(auctionId);
  if (ownerId === null) throw Errors.notFound("Auction not found");
  if (!(user.role === "ORGANIZER" && ownerId === user.id)) {
    throw Errors.forbidden("Only the organizer may control this auction");
  }
}
