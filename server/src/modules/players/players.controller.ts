import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import {
  playerQuerySchema,
  leaguePlayerQuerySchema,
  FOOTBALL_DETAIL_BY_BUCKET,
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
  const isCricket = body.sport === "CRICKET";
  const isFootball = body.sport === "FOOTBALL";
  // Cricket uses the structured role; the freeform `role` is dropped for cricket.
  const cricketRole = isCricket ? body.cricketRole || null : null;
  const footballPosition = isFootball ? body.footballPosition || null : null;
  return {
    name: body.name,
    sport: body.sport,
    // Cricket + football use structured roles/positions; freeform role is dropped.
    role: isCricket || isFootball ? null : nz(body.role),
    nationality: nz(body.nationality),
    externalRef: nz(body.externalRef),
    dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
    footballPosition,
    // Detail kept only when it matches the chosen bucket.
    footballDetailPosition:
      footballPosition &&
      body.footballDetailPosition &&
      FOOTBALL_DETAIL_BY_BUCKET[footballPosition].includes(body.footballDetailPosition)
        ? body.footballDetailPosition
        : null,
    // Conditional cricket fields — cleared when the role doesn't use them.
    cricketRole,
    battingPosition: cricketRole ? body.battingPosition || null : null,
    bowlingStyle:
      cricketRole === "BOWLER" || cricketRole === "ALL_ROUNDER" ? body.bowlingStyle || null : null,
    allRounderType: cricketRole === "ALL_ROUNDER" ? body.allRounderType || null : null,
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
  const orderBy = { [query.sort]: query.dir } as Prisma.PlayerOrderByWithRelationInput;
  const [rows, total] = await Promise.all([
    prisma.player.findMany({ where, orderBy, skip, take }),
    prisma.player.count({ where }),
  ]);
  res.json(paginate(rows.map(toPlayer), total, query));
}

export async function createPlayer(req: Request, res: Response): Promise<void> {
  const body = req.body as CreatePlayerInput;
  const data = playerData(body);
  // Photo is optional: an uploaded file wins; otherwise an external URL; else none.
  const photoUrl = req.file ? publicUrlFor(req.file.filename) : nz(body.photoUrl);
  const player = await prisma.player.create({ data: { ...data, photoUrl } });
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
  const body = req.body as UpdatePlayerInput;
  const data = playerData(body);
  // Replace the photo only when a new URL is supplied (non-destructive otherwise;
  // file uploads on edit go through the dedicated /:id/photo endpoint).
  const photoUrl = nz(body.photoUrl);
  const player = await prisma.player.update({
    where: { id },
    data: photoUrl ? { ...data, photoUrl } : data,
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

  const query = leaguePlayerQuerySchema.parse(req.query);
  const { skip, take } = toSkipTake(query);
  const where: Prisma.PlayerWhereInput = {
    sport: league.sport,
    ...(query.q ? { name: { contains: query.q } } : {}),
  };

  // Ban status lives on the related PlayerLeagueStatus (per league), which Prisma
  // can't orderBy directly. Order + paginate the IDs with a raw LEFT JOIN, then
  // load the rows (with status) through the typed client. `dir`/`sort` come from a
  // validated enum, so the inlined keywords are safe.
  const dir = query.dir === "desc" ? Prisma.raw("DESC") : Prisma.raw("ASC");
  const search = query.q ? Prisma.sql`AND p.name LIKE ${`%${query.q}%`}` : Prisma.empty;
  const orderBy =
    query.sort === "banned"
      ? Prisma.sql`COALESCE(s.banned, 0) ${dir}, p.name ASC`
      : Prisma.sql`p.name ${dir}`;

  const idRows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT p.id
    FROM \`Player\` p
    LEFT JOIN \`PlayerLeagueStatus\` s ON s.playerId = p.id AND s.leagueId = ${leagueId}
    WHERE p.sport = ${league.sport} ${search}
    ORDER BY ${orderBy}
    LIMIT ${take} OFFSET ${skip}
  `);
  const ids = idRows.map((r) => r.id);

  const [rows, total] = await Promise.all([
    prisma.player.findMany({
      where: { id: { in: ids } },
      include: { leagueStatuses: { where: { leagueId } } },
    }),
    prisma.player.count({ where }),
  ]);
  // `findMany` with `in` doesn't preserve order, so reorder to match the raw page.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);
  res.json(paginate(ordered.map(toLeaguePlayer), total, query));
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
