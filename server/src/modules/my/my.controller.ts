import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { toAuction } from "../auctions/auctions.mapper.js";

// ===========================================================================
// The franchise owner's own navigation: the leagues they hold a franchise in,
// those leagues' seasons, and each season's auctions. Read models only —
// everything here is scoped to "leagues where I own a franchise", so a
// franchise user can browse their competition without organizer permissions.
// ===========================================================================

/** Guard: the caller owns a franchise in this league (or is the organizer/admin). */
async function assertLeagueMember(userId: string, role: string, leagueId: string): Promise<void> {
  if (role === "SUPER_ADMIN") return;
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { organizerId: true },
  });
  if (!league) throw Errors.notFound("League not found");
  if (role === "ORGANIZER" && league.organizerId === userId) return;
  const owns = await prisma.franchise.findFirst({
    where: { leagueId, ownerUserId: userId },
    select: { id: true },
  });
  if (!owns) throw Errors.forbidden("You have no franchise in this league");
}

// GET /api/my/leagues — the leagues this user can browse teams in: a franchise
// owner sees leagues holding their franchise, an organizer their own leagues,
// a super-admin all of them.
export async function listMyLeagues(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const where =
    user.role === "SUPER_ADMIN"
      ? {}
      : user.role === "ORGANIZER"
        ? { organizerId: user.id }
        : { franchises: { some: { ownerUserId: user.id } } };
  const leagues = await prisma.league.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { seasons: true } },
      franchises: {
        where: { ownerUserId: user.id },
        select: { id: true, name: true, shortName: true, primaryColor: true, logoUrl: true },
      },
    },
  });
  res.json(
    leagues.map((l) => ({
      id: l.id,
      name: l.name,
      shortName: l.shortName,
      sport: l.sport,
      seasonCount: l._count.seasons,
      myFranchises: l.franchises,
    })),
  );
}

// GET /api/my/leagues/:leagueId/seasons — the league's seasons, with whether my
// franchise is participating and how many auctions each season holds.
export async function listMyLeagueSeasons(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const leagueId = req.params.leagueId!;
  await assertLeagueMember(user.id, user.role, leagueId);

  const seasons = await prisma.season.findMany({
    where: { leagueId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { auctions: true } },
      seasonFranchises: {
        where: { franchise: { ownerUserId: user.id } },
        select: { id: true },
      },
    },
  });
  res.json(
    seasons.map((s) => ({
      id: s.id,
      name: s.name,
      startDate: s.startDate ? s.startDate.toISOString() : null,
      endDate: s.endDate ? s.endDate.toISOString() : null,
      auctionCount: s._count.auctions,
      participating: s.seasonFranchises.length > 0,
    })),
  );
}

// GET /api/my/seasons/:seasonId/auctions — a season's auctions (newest first).
export async function listMySeasonAuctions(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const seasonId = req.params.seasonId!;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { leagueId: true, name: true, league: { select: { name: true } } },
  });
  if (!season) throw Errors.notFound("Season not found");
  await assertLeagueMember(user.id, user.role, season.leagueId);

  const auctions = await prisma.auction.findMany({
    where: { seasonId },
    orderBy: { createdAt: "desc" },
    include: {
      season: { select: { name: true, league: { select: { name: true, sport: true } } } },
      _count: { select: { teams: true, auctionPlayers: true } },
    },
  });
  res.json({
    seasonName: season.name,
    leagueName: season.league.name,
    auctions: auctions.map(toAuction),
  });
}
