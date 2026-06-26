import type { Request, Response } from "express";
import type {
  CreateAuctionInput,
  UpdateAuctionInput,
  AuctionRulesInput,
  LineupRulesInput,
  IncrementTiersInput,
  AllowedFormationsInput,
  AuctionDetail,
} from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { money } from "../../lib/money.js";
import { auctionContext, assertDraft } from "./auctions.service.js";
import { toAuction, toRules, toLineupRules, toTier } from "./auctions.mapper.js";
import { toFormation } from "./lots.mapper.js";

// POST /api/seasons/:seasonId/auctions
export async function createAuction(req: Request, res: Response): Promise<void> {
  const seasonId = req.params.seasonId;
  if (!seasonId) throw Errors.notFound();
  const body = req.body as CreateAuctionInput;
  const auction = await prisma.auction.create({
    data: { name: body.name, biddingMode: body.biddingMode, seasonId },
    include: { _count: { select: { teams: true, auctionPlayers: true } } },
  });
  res.status(201).json(toAuction(auction));
}

// GET /api/auctions/mine — auctions the caller participates in (franchise owns a
// team) or controls (organizer owns the league; super-admin sees all). Powers
// the dashboard entry point into the live auction screen.
export async function listMyAuctions(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const where =
    user.role === "SUPER_ADMIN"
      ? {}
      : user.role === "ORGANIZER"
        ? { season: { league: { organizerId: user.id } } }
        : { teams: { some: { ownerUserId: user.id } } };
  const auctions = await prisma.auction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { teams: true, auctionPlayers: true } } },
  });
  res.json(auctions.map(toAuction));
}

// GET /api/seasons/:seasonId/auctions
export async function listAuctions(req: Request, res: Response): Promise<void> {
  const seasonId = req.params.seasonId;
  if (!seasonId) throw Errors.notFound();
  const auctions = await prisma.auction.findMany({
    where: { seasonId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { teams: true, auctionPlayers: true } } },
  });
  res.json(auctions.map(toAuction));
}

// GET /api/auctions/:id — full configuration for the setup screen.
export async function getAuction(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw Errors.notFound();
  const a = await prisma.auction.findUnique({
    where: { id },
    include: {
      rules: true,
      lineupRules: true,
      incrementTiers: { orderBy: { fromAmount: "asc" } },
      allowedFormations: { select: { formationId: true } },
      season: { select: { league: { select: { id: true, sport: true } } } },
      _count: { select: { teams: true, auctionPlayers: true } },
    },
  });
  if (!a) throw Errors.notFound();
  const detail: AuctionDetail = {
    ...toAuction(a),
    sport: a.season.league.sport,
    leagueId: a.season.league.id,
    rules: a.rules ? toRules(a.rules) : null,
    lineupRules: a.lineupRules ? toLineupRules(a.lineupRules) : null,
    incrementTiers: a.incrementTiers.map(toTier),
    allowedFormationIds: a.allowedFormations.map((f) => f.formationId),
  };
  res.json(detail);
}

export async function updateAuction(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  assertDraft(await auctionContext(id));
  const body = req.body as UpdateAuctionInput;
  const a = await prisma.auction.update({
    where: { id },
    data: { name: body.name, biddingMode: body.biddingMode },
    include: { _count: { select: { teams: true, auctionPlayers: true } } },
  });
  res.json(toAuction(a));
}

export async function deleteAuction(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  assertDraft(await auctionContext(id));
  await prisma.$transaction([
    prisma.bidIncrementTier.deleteMany({ where: { auctionId: id } }),
    prisma.auctionAllowedFormation.deleteMany({ where: { auctionId: id } }),
    prisma.auctionPlayer.deleteMany({ where: { auctionId: id } }),
    prisma.team.deleteMany({ where: { auctionId: id } }),
    prisma.auctionRules.deleteMany({ where: { auctionId: id } }),
    prisma.lineupRules.deleteMany({ where: { auctionId: id } }),
    prisma.auction.delete({ where: { id } }),
  ]);
  res.status(204).end();
}

// PUT /api/auctions/:id/rules
export async function putRules(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  assertDraft(await auctionContext(id));
  const b = req.body as AuctionRulesInput;
  const data = {
    creditPerTeam: money(b.creditPerTeam),
    minPlayersPerTeam: b.minPlayersPerTeam,
    maxPlayersPerTeam: b.maxPlayersPerTeam,
    minTeams: b.minTeams,
    maxTeams: b.maxTeams,
    unsoldPrice: money(b.unsoldPrice),
    defaultLotDurationSec: b.defaultLotDurationSec,
  };
  const rules = await prisma.auctionRules.upsert({
    where: { auctionId: id },
    create: { auctionId: id, ...data },
    update: data,
  });
  res.json(toRules(rules));
}

// PUT /api/auctions/:id/lineup-rules
export async function putLineupRules(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  assertDraft(await auctionContext(id));
  const b = req.body as LineupRulesInput;
  const data = {
    startingSize: b.startingSize,
    overseasCapEnabled: b.overseasCapEnabled,
    maxOverseasInXI: b.overseasCapEnabled ? (b.maxOverseasInXI ?? null) : null,
    requireWicketkeeper: b.requireWicketkeeper,
    requireCaptain: b.requireCaptain,
    requireViceCaptain: b.requireViceCaptain,
    requireFirstBowler: b.requireFirstBowler,
    requireSecondBowler: b.requireSecondBowler,
    requireFullBattingOrder: b.requireFullBattingOrder,
    benchSize: typeof b.benchSize === "number" ? b.benchSize : null,
    editableAfterLockByOwner: b.editableAfterLockByOwner,
  };
  const rules = await prisma.lineupRules.upsert({
    where: { auctionId: id },
    create: { auctionId: id, ...data },
    update: data,
  });
  res.json(toLineupRules(rules));
}

// PUT /api/auctions/:id/increment-tiers — replace the whole set.
export async function putIncrementTiers(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  assertDraft(await auctionContext(id));
  const b = req.body as IncrementTiersInput;
  await prisma.$transaction([
    prisma.bidIncrementTier.deleteMany({ where: { auctionId: id } }),
    prisma.bidIncrementTier.createMany({
      data: b.tiers.map((t) => ({
        auctionId: id,
        fromAmount: money(t.fromAmount),
        increment: money(t.increment),
      })),
    }),
  ]);
  const tiers = await prisma.bidIncrementTier.findMany({
    where: { auctionId: id },
    orderBy: { fromAmount: "asc" },
  });
  res.json(tiers.map(toTier));
}

// PUT /api/auctions/:id/formations — set allowed football formations.
export async function putAllowedFormations(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  assertDraft(await auctionContext(id));
  const b = req.body as AllowedFormationsInput;
  const ids = [...new Set(b.formationIds)];
  if (ids.length > 0) {
    const found = await prisma.formation.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw Errors.validation("Unknown formation selected");
  }
  await prisma.$transaction([
    prisma.auctionAllowedFormation.deleteMany({ where: { auctionId: id } }),
    prisma.auctionAllowedFormation.createMany({
      data: ids.map((formationId) => ({ auctionId: id, formationId })),
    }),
  ]);
  res.json({ formationIds: ids });
}

// GET /api/formations — global presets.
export async function listFormations(_req: Request, res: Response): Promise<void> {
  const formations = await prisma.formation.findMany({ orderBy: { name: "asc" } });
  res.json(formations.map(toFormation));
}

// POST /api/auctions/:id/go-live — gated transition DRAFT → LIVE.
export async function goLive(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  const ctx = await auctionContext(id);
  if (ctx.status !== "DRAFT") throw Errors.invalidState("Auction is not in DRAFT");

  const [rules, teamCount, lotCount, tierCount] = await Promise.all([
    prisma.auctionRules.findUnique({ where: { auctionId: id } }),
    prisma.team.count({ where: { auctionId: id } }),
    prisma.auctionPlayer.count({ where: { auctionId: id } }),
    prisma.bidIncrementTier.count({ where: { auctionId: id } }),
  ]);
  if (!rules) throw Errors.invalidState("Set the auction rules before going live");
  if (tierCount === 0)
    throw Errors.invalidState("Add at least one bid-increment tier before going live");
  if (lotCount === 0) throw Errors.invalidState("Add at least one player to the lot list");
  if (teamCount < rules.minTeams || teamCount > rules.maxTeams) {
    throw Errors.invalidState(
      `Team count (${teamCount}) must be between ${rules.minTeams} and ${rules.maxTeams}`,
    );
  }
  const a = await prisma.auction.update({
    where: { id },
    data: { status: "LIVE" },
    include: { _count: { select: { teams: true, auctionPlayers: true } } },
  });
  res.json(toAuction(a));
}
