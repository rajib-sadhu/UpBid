import type { Request, Response } from "express";
import type {
  CreateSeasonInput,
  UpdateSeasonInput,
  SetSeasonFranchisesInput,
  SeasonFranchisesData,
} from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { toSeason } from "./seasons.mapper.js";
import { parseDate } from "./seasons.service.js";

// The season's franchise selection is frozen once any of its auctions leaves DRAFT
// (teams are committing budget by then).
async function seasonLocked(seasonId: string): Promise<boolean> {
  const nonDraft = await prisma.auction.count({
    where: { seasonId, status: { not: "DRAFT" } },
  });
  return nonDraft > 0;
}

async function seasonLeagueId(seasonId: string): Promise<string> {
  const s = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { leagueId: true },
  });
  if (!s) throw Errors.notFound("Season not found");
  return s.leagueId;
}

/** Build the season-selection view: every league franchise + whether it's in. */
async function buildSeasonFranchises(seasonId: string): Promise<SeasonFranchisesData> {
  const leagueId = await seasonLeagueId(seasonId);
  const [franchises, selected, locked] = await Promise.all([
    prisma.franchise.findMany({
      where: { leagueId },
      orderBy: { createdAt: "asc" },
      include: { owner: { select: { name: true } } },
    }),
    prisma.seasonFranchise.findMany({ where: { seasonId }, select: { franchiseId: true } }),
    seasonLocked(seasonId),
  ]);
  const sel = new Set(selected.map((s) => s.franchiseId));
  return {
    seasonId,
    locked,
    franchises: franchises.map((f) => ({
      franchiseId: f.id,
      name: f.name,
      shortName: f.shortName,
      primaryColor: f.primaryColor,
      secondaryColor: f.secondaryColor,
      logoUrl: f.logoUrl,
      ownerName: f.owner?.name ?? null,
      selected: sel.has(f.id),
    })),
  };
}

// GET /api/seasons/:id/franchises — selection screen data.
export async function getSeasonFranchises(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  res.json(await buildSeasonFranchises(id));
}

// PUT /api/seasons/:id/franchises — replace the set of participating franchises.
export async function setSeasonFranchises(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  const leagueId = await seasonLeagueId(id);
  if (await seasonLocked(id)) {
    throw Errors.invalidState("Participating teams are locked once an auction has gone live");
  }
  const body = req.body as SetSeasonFranchisesInput;
  const ids = [...new Set(body.franchiseIds)];
  if (ids.length > 0) {
    const count = await prisma.franchise.count({ where: { id: { in: ids }, leagueId } });
    if (count !== ids.length) throw Errors.validation("A selected team is not in this league");
  }
  await prisma.$transaction([
    prisma.seasonFranchise.deleteMany({ where: { seasonId: id } }),
    ...(ids.length
      ? [
          prisma.seasonFranchise.createMany({
            data: ids.map((franchiseId) => ({ seasonId: id, franchiseId })),
          }),
        ]
      : []),
  ]);
  res.json(await buildSeasonFranchises(id));
}

// GET /api/seasons/:id — single season (for the season detail page).
export async function getSeason(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw Errors.notFound();
  const season = await prisma.season.findUnique({
    where: { id },
    include: { _count: { select: { auctions: true } } },
  });
  if (!season) throw Errors.notFound();
  res.json(toSeason(season));
}

// Nested under a league: GET /api/leagues/:leagueId/seasons
export async function listSeasons(req: Request, res: Response): Promise<void> {
  const leagueId = req.params.leagueId;
  if (!leagueId) throw Errors.notFound();
  const seasons = await prisma.season.findMany({
    where: { leagueId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { auctions: true } } },
  });
  res.json(seasons.map(toSeason));
}

// Nested under a league: POST /api/leagues/:leagueId/seasons
export async function createSeason(req: Request, res: Response): Promise<void> {
  const leagueId = req.params.leagueId;
  if (!leagueId) throw Errors.notFound();
  const body = req.body as CreateSeasonInput;
  const season = await prisma.season.create({
    data: {
      name: body.name,
      leagueId,
      startDate: parseDate(body.startDate),
      endDate: parseDate(body.endDate),
    },
  });
  res.status(201).json(toSeason(season));
}

export async function updateSeason(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw Errors.notFound();
  const body = req.body as UpdateSeasonInput;
  const season = await prisma.season.update({
    where: { id },
    data: {
      name: body.name,
      startDate: parseDate(body.startDate),
      endDate: parseDate(body.endDate),
    },
  });
  res.json(toSeason(season));
}

export async function deleteSeason(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw Errors.notFound();
  const auctions = await prisma.auction.count({ where: { seasonId: id } });
  if (auctions > 0) throw Errors.conflict("Delete the season's auctions first");
  await prisma.season.delete({ where: { id } });
  res.status(204).end();
}
