import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import type {
  CreateAuctionInput,
  UpdateAuctionInput,
  AuctionRulesInput,
  LineupRulesInput,
  CricketSquadTargetsInput,
  IncrementTiersInput,
  AllowedFormationsInput,
  AuctionDetail,
} from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { money } from "../../lib/money.js";
import { auctionContext, assertDraft } from "./auctions.service.js";
import {
  toAuction,
  toRules,
  toLineupRules,
  toCricketSquadTargets,
  toTier,
} from "./auctions.mapper.js";
import { toFormation } from "./lots.mapper.js";
import * as timer from "../../realtime/timer.js";
import { SERVER_EVENTS } from "shared";
import { suspendSeasonRivals } from "../../services/phase.js";
import { emitToRoom } from "../../realtime/broadcast.js";
import { buildStateSnapshot } from "../../realtime/snapshot.js";

// POST /api/seasons/:seasonId/auctions — optionally cloning the settings
// (rules, increment tiers, squad targets, lineup rules, formations — never the
// lot list) of another auction from the same league.
export async function createAuction(req: Request, res: Response): Promise<void> {
  const seasonId = req.params.seasonId;
  if (!seasonId) throw Errors.notFound();
  const body = req.body as CreateAuctionInput;

  let source: Prisma.AuctionGetPayload<{
    include: {
      rules: true;
      incrementTiers: true;
      cricketSquadTargets: true;
      lineupRules: true;
      allowedFormations: true;
      season: { select: { leagueId: true } };
    };
  }> | null = null;
  if (body.cloneFromAuctionId) {
    const [season, src] = await Promise.all([
      prisma.season.findUnique({ where: { id: seasonId }, select: { leagueId: true } }),
      prisma.auction.findUnique({
        where: { id: body.cloneFromAuctionId },
        include: {
          rules: true,
          incrementTiers: true,
          cricketSquadTargets: true,
          lineupRules: true,
          allowedFormations: true,
          season: { select: { leagueId: true } },
        },
      }),
    ]);
    if (!season) throw Errors.notFound();
    if (!src || src.season.leagueId !== season.leagueId) {
      throw Errors.validation("The template auction must belong to the same league");
    }
    source = src;
  }

  const auction = await prisma.$transaction(async (tx) => {
    // One auction at a time per season: a new auction may only be created once
    // every earlier auction in the season is COMPLETED or CANCELLED.
    const unfinished = await tx.auction.findFirst({
      where: { seasonId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      select: { name: true },
    });
    if (unfinished) {
      throw Errors.conflict(
        `This season already has an auction in progress ("${unfinished.name}"). Complete or cancel it before creating another.`,
      );
    }
    const created = await tx.auction.create({
      data: { name: body.name, biddingMode: body.biddingMode, seasonId },
      include: { _count: { select: { teams: true, auctionPlayers: true } } },
    });
    if (!source) return created;
    if (source.rules) {
      await tx.auctionRules.create({
        data: {
          auctionId: created.id,
          creditPerTeam: source.rules.creditPerTeam,
          minPlayersPerTeam: source.rules.minPlayersPerTeam,
          maxPlayersPerTeam: source.rules.maxPlayersPerTeam,
          unsoldPrice: source.rules.unsoldPrice,
          defaultBasePrice: source.rules.defaultBasePrice,
          defaultLotDurationSec: source.rules.defaultLotDurationSec,
          maxRetentionsPerTeam: source.rules.maxRetentionsPerTeam,
        },
      });
    }
    if (source.incrementTiers.length > 0) {
      await tx.bidIncrementTier.createMany({
        data: source.incrementTiers.map((t) => ({
          auctionId: created.id,
          fromAmount: t.fromAmount,
          increment: t.increment,
        })),
      });
    }
    if (source.cricketSquadTargets) {
      const { id: _i, auctionId: _a, ...targets } = source.cricketSquadTargets;
      await tx.cricketSquadTargets.create({ data: { auctionId: created.id, ...targets } });
    }
    if (source.lineupRules) {
      const { id: _i, auctionId: _a, ...lineup } = source.lineupRules;
      await tx.lineupRules.create({ data: { auctionId: created.id, ...lineup } });
    }
    if (source.allowedFormations.length > 0) {
      await tx.auctionAllowedFormation.createMany({
        data: source.allowedFormations.map((f) => ({
          auctionId: created.id,
          formationId: f.formationId,
        })),
      });
    }
    return created;
  });
  res.status(201).json(toAuction(auction));
}

// GET /api/leagues/:leagueId/auctions — every auction across the league's
// seasons (newest first); powers the "copy settings from…" template picker.
export async function listLeagueAuctions(req: Request, res: Response): Promise<void> {
  const leagueId = req.params.leagueId;
  if (!leagueId) throw Errors.notFound();
  const auctions = await prisma.auction.findMany({
    where: { season: { leagueId } },
    orderBy: { createdAt: "desc" },
    include: {
      season: { select: { name: true, league: { select: { name: true, sport: true } } } },
      _count: { select: { teams: true, auctionPlayers: true } },
    },
  });
  res.json(auctions.map(toAuction));
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
        : { teams: { some: { franchise: { ownerUserId: user.id } } } };
  const auctions = await prisma.auction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      season: { select: { name: true, league: { select: { name: true, sport: true } } } },
      _count: { select: { teams: true, auctionPlayers: true } },
    },
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
      cricketSquadTargets: true,
      incrementTiers: { orderBy: { fromAmount: "asc" } },
      allowedFormations: { select: { formationId: true } },
      season: { select: { name: true, league: { select: { id: true, name: true, sport: true } } } },
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
    cricketSquadTargets: a.cricketSquadTargets
      ? toCricketSquadTargets(a.cricketSquadTargets)
      : null,
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

// DELETE /api/auctions/:id — permanent hard-delete, allowed in ANY status (a
// live auction's bids/sales/teams are all wiped — unrecoverable). For a soft
// end that keeps records, use the in-room "Cancel auction" action instead.
export async function deleteAuction(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  // Existence/ownership check (no DRAFT gate — any status is deletable now).
  await auctionContext(id);
  // Stop any live lot timer so a stray tick can't fire on a deleted auction.
  timer.stop(id);
  await prisma.$transaction([
    // Release the live-lot FK before deleting auction players.
    prisma.auction.update({ where: { id }, data: { currentAuctionPlayerId: null } }),
    // Children first (no onDelete cascade is declared on these relations).
    prisma.lineupMember.deleteMany({ where: { lineup: { team: { auctionId: id } } } }),
    prisma.lineup.deleteMany({ where: { team: { auctionId: id } } }),
    prisma.teamPlayer.deleteMany({ where: { team: { auctionId: id } } }),
    prisma.bid.deleteMany({ where: { auctionId: id } }),
    prisma.bidIncrementTier.deleteMany({ where: { auctionId: id } }),
    prisma.auctionAllowedFormation.deleteMany({ where: { auctionId: id } }),
    prisma.auctionPlayer.deleteMany({ where: { auctionId: id } }),
    prisma.team.deleteMany({ where: { auctionId: id } }),
    prisma.auctionRules.deleteMany({ where: { auctionId: id } }),
    prisma.lineupRules.deleteMany({ where: { auctionId: id } }),
    prisma.cricketSquadTargets.deleteMany({ where: { auctionId: id } }),
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
    unsoldPrice: money(b.unsoldPrice),
    defaultBasePrice: money(b.defaultBasePrice),
    defaultLotDurationSec: b.defaultLotDurationSec,
    maxRetentionsPerTeam: b.maxRetentionsPerTeam,
  };
  const rules = await prisma.auctionRules.upsert({
    where: { auctionId: id },
    create: { auctionId: id, ...data },
    update: data,
  });
  res.json(toRules(rules));
}

// PUT /api/auctions/:id/cricket-squad-targets — auto-pilot composition targets.
export async function putCricketSquadTargets(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  assertDraft(await auctionContext(id));
  const b = req.body as CricketSquadTargetsInput;
  const data = {
    minWicketkeepers: b.minWicketkeepers,
    minBatsmen: b.minBatsmen,
    minOpeners: b.minOpeners,
    minPaceBowlers: b.minPaceBowlers,
    minSpinners: b.minSpinners,
    minAllRounders: b.minAllRounders,
  };
  const targets = await prisma.cricketSquadTargets.upsert({
    where: { auctionId: id },
    create: { auctionId: id, ...data },
    update: data,
  });
  res.json(toCricketSquadTargets(targets));
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

/**
 * Randomize each auction player's `lotOrder` within its role group. Fisher–Yates
 * per group; group order is preserved, so the saved sequence is role-clustered
 * but internally shuffled. Persisted once at go-live → identical for every viewer.
 */
async function shuffleLotOrderByRole(
  tx: Prisma.TransactionClient,
  auctionId: string,
): Promise<void> {
  const players = await tx.auctionPlayer.findMany({
    where: { auctionId, status: "PENDING" },
    select: {
      id: true,
      player: { select: { cricketRole: true, footballPosition: true, role: true } },
    },
  });

  // Group ids by role key (cricket role > football position > generic role).
  const groups = new Map<string, string[]>();
  for (const p of players) {
    const key = p.player.cricketRole ?? p.player.footballPosition ?? p.player.role ?? "OTHER";
    let ids = groups.get(key);
    if (!ids) groups.set(key, (ids = []));
    ids.push(p.id);
  }

  let order = 0;
  const updates: Promise<unknown>[] = [];
  for (const ids of groups.values()) {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    for (const pid of ids) {
      updates.push(tx.auctionPlayer.update({ where: { id: pid }, data: { lotOrder: order++ } }));
    }
  }
  await Promise.all(updates);
}

// POST /api/auctions/:id/go-live — gated transition DRAFT → LIVE. Materializes a
// Team (per-auction tally) for each franchise the season selected.
export async function goLive(req: Request, res: Response): Promise<void> {
  const id = req.params.id!;
  const ctx = await auctionContext(id);
  if (ctx.status !== "DRAFT") throw Errors.invalidState("Auction is not in DRAFT");

  const auction = await prisma.auction.findUniqueOrThrow({
    where: { id },
    select: { seasonId: true },
  });
  const [rules, lotCount, tierCount, seasonFranchises, existingTeams, retentions] =
    await Promise.all([
      prisma.auctionRules.findUnique({ where: { auctionId: id } }),
      prisma.auctionPlayer.count({ where: { auctionId: id } }),
      prisma.bidIncrementTier.count({ where: { auctionId: id } }),
      prisma.seasonFranchise.findMany({
        where: { seasonId: auction.seasonId },
        select: { franchiseId: true },
      }),
      prisma.team.findMany({ where: { auctionId: id }, select: { franchiseId: true } }),
      prisma.auctionRetention.findMany({
        where: { auctionId: id },
        include: { franchise: { select: { name: true } } },
      }),
    ]);
  if (!rules) throw Errors.invalidState("Set the auction rules before going live");
  if (tierCount === 0)
    throw Errors.invalidState("Add at least one bid-increment tier before going live");
  if (lotCount === 0) throw Errors.invalidState("Add at least one player to the lot list");

  const teamCount = seasonFranchises.length;
  if (teamCount < 2) {
    throw Errors.invalidState(
      `An auction needs at least 2 teams (selected: ${teamCount}). ` +
        `Pick participating teams on the season page.`,
    );
  }

  // Re-validate retentions against the final rules/selection (both can change
  // after the retentions were staged): selected franchise, cap, and the team
  // must still afford its squad minimum after paying for what it kept.
  const selectedIds = new Set(seasonFranchises.map((sf) => sf.franchiseId));
  const byFranchise = new Map<string, typeof retentions>();
  for (const r of retentions) {
    if (!selectedIds.has(r.franchiseId)) {
      throw Errors.invalidState(
        `"${r.franchise.name}" has retained players but is not in the season's team selection`,
      );
    }
    const list = byFranchise.get(r.franchiseId) ?? [];
    list.push(r);
    byFranchise.set(r.franchiseId, list);
  }
  for (const [, list] of byFranchise) {
    if (list.length > rules.maxRetentionsPerTeam) {
      throw Errors.invalidState(
        `"${list[0]!.franchise.name}" retains ${list.length} players — the cap is ${rules.maxRetentionsPerTeam}`,
      );
    }
    const total = list.reduce((sum, r) => sum.plus(r.price), money("0"));
    const remainingMin = Math.max(0, rules.minPlayersPerTeam - list.length);
    const needed = total.plus(money(rules.unsoldPrice).times(remainingMin));
    if (needed.greaterThan(rules.creditPerTeam)) {
      throw Errors.invalidState(
        `"${list[0]!.franchise.name}" cannot afford its retentions and still reach ` +
          `${rules.minPlayersPerTeam} players within the ${rules.creditPerTeam} budget`,
      );
    }
  }

  // Overseas flags carry over from the source auction's lots.
  const sourceOverseas = new Map<string, boolean>();
  if (retentions.length) {
    const src = await prisma.auction.findUniqueOrThrow({
      where: { id },
      select: { retentionSourceAuctionId: true },
    });
    if (src.retentionSourceAuctionId) {
      const lots = await prisma.auctionPlayer.findMany({
        where: {
          auctionId: src.retentionSourceAuctionId,
          playerId: { in: retentions.map((r) => r.playerId) },
        },
        select: { playerId: true, isOverseas: true },
      });
      for (const l of lots) sourceOverseas.set(l.playerId, l.isOverseas);
    }
  }

  // Materialize teams from the season's franchises (idempotent).
  const have = new Set(existingTeams.map((t) => t.franchiseId));
  const toCreate = seasonFranchises.filter((sf) => !have.has(sf.franchiseId));

  // One live auction per season: force-suspend any other running auction of
  // this season before this one takes the stage.
  const suspended = await suspendSeasonRivals(auction.seasonId, id);

  const a = await prisma.$transaction(async (tx) => {
    if (toCreate.length) {
      await tx.team.createMany({
        data: toCreate.map((sf) => ({ auctionId: id, franchiseId: sf.franchiseId })),
      });
    }

    // Materialize retentions: each staged row becomes a RETAINED lot (never in
    // the bidding queue; carries isOverseas for the lineup cap) plus a squad
    // TeamPlayer, and seeds the team's committedAmount/playerCount — so the
    // reserve math starts from what retention already spent.
    if (byFranchise.size) {
      const teams = await tx.team.findMany({
        where: { auctionId: id },
        select: { id: true, franchiseId: true },
      });
      const teamByFranchise = new Map(teams.map((t) => [t.franchiseId, t.id]));
      for (const [franchiseId, list] of byFranchise) {
        const teamId = teamByFranchise.get(franchiseId)!;
        for (const r of list) {
          const lot = await tx.auctionPlayer.create({
            data: {
              auctionId: id,
              playerId: r.playerId,
              basePrice: r.price,
              status: "RETAINED",
              soldToTeamId: teamId,
              soldPrice: r.price,
              isOverseas: sourceOverseas.get(r.playerId) ?? false,
            },
          });
          await tx.teamPlayer.create({
            data: {
              teamId,
              auctionPlayerId: lot.id,
              playerId: r.playerId,
              price: r.price,
              acquiredVia: "RETAINED",
            },
          });
        }
        const total = list.reduce((sum, r) => sum.plus(r.price), money("0"));
        await tx.team.update({
          where: { id: teamId },
          data: { committedAmount: total, playerCount: list.length },
        });
      }
    }

    // One-time shuffle: randomize lot order WITHIN each role so the live
    // sequence isn't the database insertion order. Players are grouped by their
    // role (cricketRole / footballPosition), shuffled inside the group, then
    // laid out group-by-group. Runs once because go-live only fires on DRAFT→LIVE.
    // RETAINED lots are excluded — they never enter the queue.
    await shuffleLotOrderByRole(tx, id);
    return tx.auction.update({
      where: { id },
      data: { status: "LIVE" },
      include: { _count: { select: { teams: true, auctionPlayers: true } } },
    });
  });

  // Tell anyone watching a force-suspended auction what just happened.
  for (const rivalId of suspended) {
    emitToRoom(rivalId, SERVER_EVENTS.STATE_SNAPSHOT, await buildStateSnapshot(rivalId));
  }
  res.json(toAuction(a));
}
