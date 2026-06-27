import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import type { CreateLeagueInput, UpdateLeagueInput } from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { toLeague } from "./leagues.mapper.js";

// A duplicate short name within the same organizer's leagues trips the
// @@unique([organizerId, shortName]) constraint.
function rethrowShortNameConflict(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw Errors.conflict("You already have a league with that short name");
  }
  throw e;
}

// ORGANIZER (or SUPER_ADMIN) creates a league they own.
export async function createLeague(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateLeagueInput;
  try {
    const league = await prisma.league.create({
      data: {
        name: body.name,
        shortName: body.shortName,
        sport: body.sport,
        organizerId: req.user!.id,
      },
    });
    res.status(201).json(toLeague(league));
  } catch (e) {
    rethrowShortNameConflict(e);
  }
}

// SUPER_ADMIN sees all leagues; ORGANIZER sees only leagues they own.
export async function listLeagues(req: Request, res: Response): Promise<void> {
  const actor = req.user!;
  const where = actor.role === "SUPER_ADMIN" ? {} : { organizerId: actor.id };
  const leagues = await prisma.league.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { seasons: true } } },
  });
  res.json(leagues.map(toLeague));
}

export async function getLeague(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw Errors.notFound();
  const league = await prisma.league.findUnique({
    where: { id },
    include: { _count: { select: { seasons: true } } },
  });
  if (!league) throw Errors.notFound();
  res.json(toLeague(league));
}

export async function updateLeague(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw Errors.notFound();
  const body = req.body as UpdateLeagueInput;
  try {
    const league = await prisma.league.update({
      where: { id },
      data: { name: body.name, shortName: body.shortName },
    });
    res.json(toLeague(league));
  } catch (e) {
    rethrowShortNameConflict(e);
  }
}

export async function deleteLeague(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw Errors.notFound();
  const seasons = await prisma.season.count({ where: { leagueId: id } });
  if (seasons > 0) throw Errors.conflict("Delete the league's seasons first");
  await prisma.playerLeagueStatus.deleteMany({ where: { leagueId: id } });
  await prisma.league.delete({ where: { id } });
  res.status(204).end();
}
