import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { listQuerySchema, type AddLotsInput, type UpdateLotInput } from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { money } from "../../lib/money.js";
import { toSkipTake, paginate } from "../../lib/pagination.js";
import { auctionContext, assertDraft } from "./auctions.service.js";
import { toLot } from "./lots.mapper.js";
import { toPlayer } from "../players/players.mapper.js";

export async function listLots(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  const lots = await prisma.auctionPlayer.findMany({
    where: { auctionId },
    orderBy: [{ lotOrder: "asc" }, { createdAt: "asc" }],
    include: { player: true },
  });
  res.json(lots.map(toLot));
}

// GET /api/auctions/:id/available-players — pool of the auction's sport, NOT banned
// in the league and NOT already a lot. This is what feeds the lot builder.
export async function listAvailablePlayers(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  const ctx = await auctionContext(auctionId);
  const query = listQuerySchema.parse(req.query);
  const { skip, take } = toSkipTake(query);
  const where: Prisma.PlayerWhereInput = {
    sport: ctx.sport,
    ...(query.q ? { name: { contains: query.q } } : {}),
    leagueStatuses: { none: { leagueId: ctx.leagueId, banned: true } },
    auctionEntries: { none: { auctionId } },
  };
  const [rows, total] = await Promise.all([
    prisma.player.findMany({ where, orderBy: { name: "asc" }, skip, take }),
    prisma.player.count({ where }),
  ]);
  res.json(paginate(rows.map(toPlayer), total, query));
}

// POST /api/auctions/:id/lots — add players to the lot list (banned excluded).
export async function addLots(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  const ctx = await auctionContext(auctionId);
  assertDraft(ctx);
  const body = req.body as AddLotsInput;

  const ids = [...new Set(body.lots.map((l) => l.playerId))];
  const players = await prisma.player.findMany({ where: { id: { in: ids } } });
  if (players.length !== ids.length) throw Errors.validation("One or more players do not exist");
  if (players.some((p) => p.sport !== ctx.sport)) {
    throw Errors.sportMismatch("All lots must match the auction's sport");
  }

  const bannedCount = await prisma.playerLeagueStatus.count({
    where: { leagueId: ctx.leagueId, banned: true, playerId: { in: ids } },
  });
  if (bannedCount > 0) throw Errors.validation("Cannot add players banned in this league");

  const last = await prisma.auctionPlayer.aggregate({
    where: { auctionId },
    _max: { lotOrder: true },
  });
  let order = (last._max.lotOrder ?? -1) + 1;

  // De-dupe against the requested list, preserving the per-player base price/flag.
  const byId = new Map(body.lots.map((l) => [l.playerId, l]));
  await prisma.auctionPlayer.createMany({
    data: ids.map((playerId) => {
      const l = byId.get(playerId)!;
      return {
        auctionId,
        playerId,
        basePrice: money(l.basePrice),
        isOverseas: l.isOverseas,
        lotOrder: order++,
      };
    }),
    skipDuplicates: true,
  });

  const lots = await prisma.auctionPlayer.findMany({
    where: { auctionId },
    orderBy: [{ lotOrder: "asc" }, { createdAt: "asc" }],
    include: { player: true },
  });
  res.status(201).json(lots.map(toLot));
}

async function lotInAuction(auctionId: string, lotId: string) {
  const lot = await prisma.auctionPlayer.findUnique({ where: { id: lotId } });
  if (!lot || lot.auctionId !== auctionId) throw Errors.notFound("Lot not found");
  return lot;
}

export async function updateLot(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  const lotId = req.params.lotId!;
  assertDraft(await auctionContext(auctionId));
  await lotInAuction(auctionId, lotId);
  const body = req.body as UpdateLotInput;
  const lot = await prisma.auctionPlayer.update({
    where: { id: lotId },
    data: {
      basePrice: money(body.basePrice),
      isOverseas: body.isOverseas,
      ...(typeof body.lotOrder === "number" ? { lotOrder: body.lotOrder } : {}),
    },
    include: { player: true },
  });
  res.json(toLot(lot));
}

export async function deleteLot(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  const lotId = req.params.lotId!;
  assertDraft(await auctionContext(auctionId));
  await lotInAuction(auctionId, lotId);
  await prisma.auctionPlayer.delete({ where: { id: lotId } });
  res.status(204).end();
}
