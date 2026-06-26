import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import {
  playerQuerySchema,
  listQuerySchema,
  type CreatePlayerInput,
  type UpdatePlayerInput,
  type BanPlayerInput,
} from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { toSkipTake, paginate } from "../../lib/pagination.js";
import { publicUrlFor } from "../../uploads/multer.js";
import { toPlayer, toLeaguePlayer } from "./players.mapper.js";

const nz = (v: string | undefined): string | null => (v && v.length > 0 ? v : null);

function playerData(body: CreatePlayerInput) {
  return {
    name: body.name,
    sport: body.sport,
    role: nz(body.role),
    nationality: nz(body.nationality),
    externalRef: nz(body.externalRef),
    dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
    footballPosition: body.footballPosition ? body.footballPosition : null,
  };
}

// ---- Global player pool ----------------------------------------------------

export async function listPlayers(req: Request, res: Response): Promise<void> {
  const query = playerQuerySchema.parse(req.query);
  const { skip, take } = toSkipTake(query);
  const where: Prisma.PlayerWhereInput = {
    ...(query.sport ? { sport: query.sport } : {}),
    ...(query.q ? { name: { contains: query.q } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.player.findMany({ where, orderBy: { name: "asc" }, skip, take }),
    prisma.player.count({ where }),
  ]);
  res.json(paginate(rows.map(toPlayer), total, query));
}

export async function createPlayer(req: Request, res: Response): Promise<void> {
  const player = await prisma.player.create({ data: playerData(req.body as CreatePlayerInput) });
  res.status(201).json(toPlayer(player));
}

export async function getPlayer(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw Errors.notFound();
  const player = await prisma.player.findUnique({ where: { id } });
  if (!player) throw Errors.notFound();
  res.json(toPlayer(player));
}

export async function updatePlayer(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw Errors.notFound();
  const player = await prisma.player.update({
    where: { id },
    data: playerData(req.body as UpdatePlayerInput),
  });
  res.json(toPlayer(player));
}

export async function deletePlayer(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw Errors.notFound();
  const entries = await prisma.auctionPlayer.count({ where: { playerId: id } });
  if (entries > 0) throw Errors.conflict("Player is used in an auction and cannot be deleted");
  await prisma.playerLeagueStatus.deleteMany({ where: { playerId: id } });
  await prisma.player.delete({ where: { id } });
  res.status(204).end();
}

export async function uploadPlayerPhoto(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw Errors.notFound();
  if (!req.file) throw Errors.validation("No image uploaded");
  const player = await prisma.player.update({
    where: { id },
    data: { photoUrl: publicUrlFor(req.file.filename) },
  });
  res.json(toPlayer(player));
}

// ---- Per-league ban status -------------------------------------------------

// GET /api/leagues/:leagueId/players — players of the league's sport + their ban status.
export async function listLeaguePlayers(req: Request, res: Response): Promise<void> {
  const leagueId = req.params.leagueId;
  if (!leagueId) throw Errors.notFound();
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { sport: true },
  });
  if (!league) throw Errors.notFound();

  const query = listQuerySchema.parse(req.query);
  const { skip, take } = toSkipTake(query);
  const where: Prisma.PlayerWhereInput = {
    sport: league.sport,
    ...(query.q ? { name: { contains: query.q } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.player.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take,
      include: { leagueStatuses: { where: { leagueId } } },
    }),
    prisma.player.count({ where }),
  ]);
  res.json(paginate(rows.map(toLeaguePlayer), total, query));
}

// PUT /api/leagues/:leagueId/players/:playerId/ban — ban/unban within a league.
export async function setPlayerBan(req: Request, res: Response): Promise<void> {
  const { leagueId, playerId } = req.params;
  if (!leagueId || !playerId) throw Errors.notFound();
  const body = req.body as BanPlayerInput;

  const [league, player] = await Promise.all([
    prisma.league.findUnique({ where: { id: leagueId }, select: { sport: true } }),
    prisma.player.findUnique({ where: { id: playerId } }),
  ]);
  if (!league || !player) throw Errors.notFound();
  if (player.sport !== league.sport) throw Errors.sportMismatch();

  const reason = body.banned ? nz(body.reason) : null;
  const status = await prisma.playerLeagueStatus.upsert({
    where: { playerId_leagueId: { playerId, leagueId } },
    create: {
      playerId,
      leagueId,
      banned: body.banned,
      bannedReason: reason,
      bannedById: body.banned ? req.user!.id : null,
      bannedAt: body.banned ? new Date() : null,
    },
    update: {
      banned: body.banned,
      bannedReason: reason,
      bannedById: body.banned ? req.user!.id : null,
      bannedAt: body.banned ? new Date() : null,
    },
  });
  res.json(toLeaguePlayer({ ...player, leagueStatuses: [status] }));
}
