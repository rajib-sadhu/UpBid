import type { Request, Response } from "express";
import type {
  RetentionSourceInput,
  FranchiseRetentionsInput,
  RetentionConfig,
  RetentionFranchise,
} from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { money, moneyToWire, add, mul, lte, ZERO } from "../../lib/money.js";
import { auctionContext, assertDraft } from "./auctions.service.js";

// ============================================================================
// Pre-auction retention (organizer-only, DRAFT-only). Selections are staged in
// AuctionRetention against the FRANCHISE (teams only materialize at go-live);
// go-live turns each row into an AuctionPlayer(RETAINED) + TeamPlayer(RETAINED)
// and seeds the team's tallies. Source = an organizer-picked COMPLETED auction
// of the same league.
// ============================================================================

/** GET /api/auctions/:id/retentions — the setup card's full read model. */
export async function getRetentionConfig(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  const ctx = await auctionContext(auctionId);

  const auction = await prisma.auction.findUniqueOrThrow({
    where: { id: auctionId },
    select: { seasonId: true, retentionSourceAuctionId: true, rules: true },
  });

  const [sourceOptions, seasonFranchises, retentions] = await Promise.all([
    prisma.auction.findMany({
      where: {
        id: { not: auctionId },
        status: "COMPLETED",
        season: { leagueId: ctx.leagueId },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, season: { select: { name: true } } },
    }),
    prisma.seasonFranchise.findMany({
      where: { seasonId: auction.seasonId },
      select: {
        franchise: {
          select: { id: true, name: true, shortName: true, primaryColor: true },
        },
      },
    }),
    prisma.auctionRetention.findMany({ where: { auctionId } }),
  ]);

  const retainedByPlayer = new Map(retentions.map((r) => [r.playerId, r]));
  const franchises: RetentionFranchise[] = [];

  if (auction.retentionSourceAuctionId) {
    // Squads of the source auction, keyed by franchise; only season-selected
    // franchises can retain.
    const [squadRows, bannedRows, lotRows] = await Promise.all([
      prisma.teamPlayer.findMany({
        where: { team: { auctionId: auction.retentionSourceAuctionId } },
        include: {
          team: { select: { franchiseId: true } },
          player: { select: { id: true, name: true, role: true, photoUrl: true } },
          auctionPlayer: { select: { isOverseas: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.playerLeagueStatus.findMany({
        where: { leagueId: ctx.leagueId, banned: true },
        select: { playerId: true },
      }),
      prisma.auctionPlayer.findMany({ where: { auctionId }, select: { playerId: true } }),
    ]);
    const banned = new Set(bannedRows.map((b) => b.playerId));
    const inLots = new Set(lotRows.map((l) => l.playerId));
    const byFranchise = new Map<string, typeof squadRows>();
    for (const row of squadRows) {
      const list = byFranchise.get(row.team.franchiseId) ?? [];
      list.push(row);
      byFranchise.set(row.team.franchiseId, list);
    }

    for (const sf of seasonFranchises) {
      const squad = byFranchise.get(sf.franchise.id) ?? [];
      let total = ZERO;
      const players = squad.map((row) => {
        const retained = retainedByPlayer.get(row.playerId);
        if (retained?.franchiseId === sf.franchise.id) total = total.plus(retained.price);
        return {
          playerId: row.playerId,
          name: row.player.name,
          role: row.player.role,
          photoUrl: row.player.photoUrl,
          isOverseas: row.auctionPlayer.isOverseas,
          prevPrice: moneyToWire(row.price),
          banned: banned.has(row.playerId),
          inLotList: inLots.has(row.playerId),
          retainedPrice:
            retained?.franchiseId === sf.franchise.id ? moneyToWire(retained.price) : null,
        };
      });
      franchises.push({
        franchiseId: sf.franchise.id,
        name: sf.franchise.name,
        shortName: sf.franchise.shortName,
        primaryColor: sf.franchise.primaryColor,
        squad: players,
        retainedTotal: moneyToWire(total),
      });
    }
  }

  const config: RetentionConfig = {
    maxRetentionsPerTeam: auction.rules?.maxRetentionsPerTeam ?? 0,
    sourceAuctionId: auction.retentionSourceAuctionId,
    sourceOptions: sourceOptions.map((o) => ({
      id: o.id,
      name: o.name,
      seasonName: o.season.name,
    })),
    franchises,
  };
  res.json(config);
}

/** PUT /api/auctions/:id/retention-source — pick (or clear) the source auction.
 *  Changing the source wipes any staged retentions (they reference its squads). */
export async function putRetentionSource(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  const ctx = await auctionContext(auctionId);
  assertDraft(ctx);
  const { sourceAuctionId } = req.body as RetentionSourceInput;

  if (sourceAuctionId) {
    const source = await prisma.auction.findUnique({
      where: { id: sourceAuctionId },
      select: { status: true, season: { select: { leagueId: true } } },
    });
    if (!source || source.season.leagueId !== ctx.leagueId) {
      throw Errors.validation("The source auction must belong to this league");
    }
    if (source.status !== "COMPLETED") {
      throw Errors.validation("Players can only be retained from a completed auction");
    }
    if (sourceAuctionId === auctionId) {
      throw Errors.validation("An auction cannot retain from itself");
    }
  }

  await prisma.$transaction([
    prisma.auctionRetention.deleteMany({ where: { auctionId } }),
    prisma.auction.update({
      where: { id: auctionId },
      data: { retentionSourceAuctionId: sourceAuctionId },
    }),
  ]);
  res.json({ sourceAuctionId });
}

/** PUT /api/auctions/:id/franchises/:franchiseId/retentions — replace-set the
 *  franchise's retained players. Full validation; DRAFT only. */
export async function putFranchiseRetentions(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  const franchiseId = req.params.franchiseId!;
  const ctx = await auctionContext(auctionId);
  assertDraft(ctx);
  const { items } = req.body as FranchiseRetentionsInput;

  const auction = await prisma.auction.findUniqueOrThrow({
    where: { id: auctionId },
    select: { seasonId: true, retentionSourceAuctionId: true, rules: true },
  });
  const rules = auction.rules;
  if (!rules) throw Errors.invalidState("Set the auction rules before configuring retention");
  if (rules.maxRetentionsPerTeam === 0) {
    throw Errors.invalidState("Retention is disabled — set a retention cap in the rules first");
  }
  if (items.length > rules.maxRetentionsPerTeam) {
    throw Errors.validation(
      `A team may retain at most ${rules.maxRetentionsPerTeam} player(s) in this auction`,
    );
  }
  if (!auction.retentionSourceAuctionId) {
    throw Errors.invalidState("Pick the auction to retain from first");
  }

  const selected = await prisma.seasonFranchise.findFirst({
    where: { seasonId: auction.seasonId, franchiseId },
  });
  if (!selected) {
    throw Errors.validation("This team is not participating in the auction's season");
  }

  const ids = items.map((i) => i.playerId);
  if (new Set(ids).size !== ids.length) {
    throw Errors.validation("A player can only be retained once");
  }

  const [sourceSquad, bannedCount, lotCount, otherRetained] = await Promise.all([
    prisma.teamPlayer.findMany({
      where: {
        team: { auctionId: auction.retentionSourceAuctionId, franchiseId },
        playerId: { in: ids },
      },
      select: { playerId: true },
    }),
    prisma.playerLeagueStatus.count({
      where: { leagueId: ctx.leagueId, banned: true, playerId: { in: ids } },
    }),
    prisma.auctionPlayer.count({ where: { auctionId, playerId: { in: ids } } }),
    prisma.auctionRetention.findFirst({
      where: { auctionId, playerId: { in: ids }, franchiseId: { not: franchiseId } },
      include: { franchise: { select: { name: true } } },
    }),
  ]);
  if (sourceSquad.length !== ids.length) {
    throw Errors.validation("Every retained player must be in this team's previous squad");
  }
  if (bannedCount > 0) throw Errors.validation("Cannot retain players banned in this league");
  if (lotCount > 0) {
    throw Errors.validation("A retained player cannot also be in the lot list — remove the lot first");
  }
  if (otherRetained) {
    throw Errors.conflict(`A player is already retained by "${otherRetained.franchise.name}"`);
  }

  // Affordability: after paying the retentions the team must still be able to
  // reach the squad minimum at the unsold price (mirrors the live reserve rule).
  const total = items.reduce((sum, i) => sum.plus(money(i.price)), ZERO);
  const remainingMin = Math.max(0, rules.minPlayersPerTeam - items.length);
  const needed = add(total, mul(rules.unsoldPrice, remainingMin));
  if (!lte(needed, rules.creditPerTeam)) {
    throw Errors.validation(
      `Retentions cost ${moneyToWire(total)} but the team must keep enough of its ` +
        `${moneyToWire(rules.creditPerTeam)} budget to reach ${rules.minPlayersPerTeam} players`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.auctionRetention.deleteMany({ where: { auctionId, franchiseId } });
    if (items.length) {
      await tx.auctionRetention.createMany({
        data: items.map((i) => ({
          auctionId,
          franchiseId,
          playerId: i.playerId,
          price: money(i.price),
        })),
      });
    }
  });
  res.json({ retained: items.length, total: moneyToWire(total) });
}
