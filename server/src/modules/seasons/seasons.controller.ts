import type { Request, Response } from "express";
import type { CreateSeasonInput, UpdateSeasonInput } from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { toSeason } from "./seasons.mapper.js";
import { parseDate } from "./seasons.service.js";

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
