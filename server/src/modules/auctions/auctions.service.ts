import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import type { Sport, AuctionStatus } from "shared";

/** Owner of an auction = the organizer of its league (auction → season → league). */
export async function auctionOwnerId(auctionId: string): Promise<string | null> {
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { season: { select: { league: { select: { organizerId: true } } } } },
  });
  return a?.season.league.organizerId ?? null;
}

/** Owner of a season (for nested auction creation/listing). */
export async function seasonOwnerIdForAuction(seasonId: string): Promise<string | null> {
  const s = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { league: { select: { organizerId: true } } },
  });
  return s?.league.organizerId ?? null;
}

export interface AuctionContext {
  id: string;
  status: AuctionStatus;
  sport: Sport;
  leagueId: string;
}

/** Fetch an auction's sport/league/status (throws NOT_FOUND if missing). */
export async function auctionContext(auctionId: string): Promise<AuctionContext> {
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: {
      id: true,
      status: true,
      season: { select: { league: { select: { id: true, sport: true } } } },
    },
  });
  if (!a) throw Errors.notFound("Auction not found");
  return { id: a.id, status: a.status, sport: a.season.league.sport, leagueId: a.season.league.id };
}

/** Mutations to auction configuration are only allowed while DRAFT. */
export function assertDraft(ctx: AuctionContext): void {
  if (ctx.status !== "DRAFT") {
    throw Errors.invalidState("Auction configuration can only be changed while in DRAFT");
  }
}
