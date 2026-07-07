import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { seedAuctionGraph, type SeededGraph } from "../../test/factory.js";
import {
  putRetentionSource,
  putFranchiseRetentions,
  getRetentionConfig,
} from "./retentions.controller.js";
import { goLive } from "./auctions.controller.js";
import { buildStateSnapshot } from "../../realtime/snapshot.js";

// ===========================================================================
// Pre-auction retention, end to end against real MySQL: stage retentions on a
// DRAFT auction from a COMPLETED source auction, validate every rejection
// path, then prove go-live materializes RETAINED lots + squad rows + team
// tallies and keeps retained players out of the bidding queue.
// ===========================================================================

const dec = (v: string) => new Prisma.Decimal(v);

/** Minimal req/res doubles for driving controllers directly. */
function fakeReq(params: Record<string, string>, body?: unknown): Request {
  return { params, body } as unknown as Request;
}
function fakeRes(): Response & { body: unknown } {
  const res = {
    body: undefined as unknown,
    status() {
      return res;
    },
    json(b: unknown) {
      res.body = b;
    },
  };
  return res as unknown as Response & { body: unknown };
}

async function call(
  handler: (req: Request, res: Response) => Promise<void>,
  params: Record<string, string>,
  body?: unknown,
): Promise<unknown> {
  const res = fakeRes();
  await handler(fakeReq(params, body), res);
  return res.body;
}

async function callCode(
  handler: (req: Request, res: Response) => Promise<void>,
  params: Record<string, string>,
  body?: unknown,
): Promise<string> {
  try {
    await handler(fakeReq(params, body), fakeRes());
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? "UNKNOWN";
  }
}

describe("pre-auction retention vs real MySQL", () => {
  let g: SeededGraph; // source graph: league, season, 2 franchises, teams, lots
  let sourceId: string;
  let targetId: string;
  let franchiseAId: string;
  let franchiseBId: string;
  /** Players sold to franchise A / B in the source auction. */
  const aPlayers: string[] = [];
  const bPlayers: string[] = [];

  beforeAll(async () => {
    g = await seedAuctionGraph(prisma, {
      tag: `ret${Date.now().toString(36)}`,
      teams: 2,
      players: 6,
      rules: { creditPerTeam: "50", minPlayersPerTeam: 1, maxPlayersPerTeam: 10, unsoldPrice: "1" },
    });
    sourceId = g.auction.id;
    const teams = await prisma.team.findMany({
      where: { auctionId: sourceId },
      select: { id: true, franchiseId: true },
    });
    franchiseAId = teams[0]!.franchiseId;
    franchiseBId = teams[1]!.franchiseId;

    // Complete the source auction with 2 sales per team (prices 3,4 / 5,6);
    // lots 4 and 5 stay unsold. The 4th lot's player is overseas.
    const prices = ["3", "4", "5", "6"];
    for (let i = 0; i < 4; i++) {
      const lot = g.lots[i]!;
      const team = teams[i < 2 ? 0 : 1]!;
      if (i === 3) {
        await prisma.auctionPlayer.update({ where: { id: lot.id }, data: { isOverseas: true } });
      }
      await prisma.auctionPlayer.update({
        where: { id: lot.id },
        data: { status: "SOLD", soldToTeamId: team.id, soldPrice: prices[i] },
      });
      await prisma.teamPlayer.create({
        data: {
          teamId: team.id,
          auctionPlayerId: lot.id,
          playerId: lot.playerId,
          price: prices[i]!,
          acquiredVia: "AUCTION",
        },
      });
      (i < 2 ? aPlayers : bPlayers).push(lot.playerId);
    }
    await prisma.auction.update({ where: { id: sourceId }, data: { status: "COMPLETED" } });

    // Target: fresh DRAFT auction in the same season, retention cap 2, with the
    // two never-sold players as its lot list.
    const target = await prisma.auction.create({
      data: {
        name: `Retention Target ${g.auction.name}`,
        seasonId: g.auction.seasonId,
        status: "DRAFT",
        rules: {
          create: {
            creditPerTeam: "20",
            minPlayersPerTeam: 2,
            maxPlayersPerTeam: 5,
            unsoldPrice: "1",
            defaultLotDurationSec: 300,
            maxRetentionsPerTeam: 2,
          },
        },
        incrementTiers: { create: [{ fromAmount: "0", increment: "0.5" }] },
      },
    });
    targetId = target.id;
    for (const i of [4, 5]) {
      await prisma.auctionPlayer.create({
        data: {
          auctionId: targetId,
          playerId: g.lots[i]!.playerId,
          basePrice: "2",
          lotOrder: i,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("accepts only a completed same-league auction as the source", async () => {
    // The DRAFT target itself is not a valid source.
    expect(
      await callCode(putRetentionSource, { id: targetId }, { sourceAuctionId: targetId }),
    ).toBe("VALIDATION_ERROR");

    expect(
      await callCode(putRetentionSource, { id: targetId }, { sourceAuctionId: sourceId }),
    ).toBe("OK");
    const updated = await prisma.auction.findUniqueOrThrow({ where: { id: targetId } });
    expect(updated.retentionSourceAuctionId).toBe(sourceId);
  });

  it("exposes previous squads with default prices in the config read model", async () => {
    const config = (await call(getRetentionConfig, { id: targetId })) as {
      maxRetentionsPerTeam: number;
      franchises: { franchiseId: string; squad: { playerId: string; prevPrice: string }[] }[];
    };
    expect(config.maxRetentionsPerTeam).toBe(2);
    const a = config.franchises.find((f) => f.franchiseId === franchiseAId)!;
    expect(a.squad.map((p) => p.playerId).sort()).toEqual([...aPlayers].sort());
    expect(a.squad.map((p) => p.prevPrice).sort()).toEqual(["3.00", "4.00"]);
  });

  it("rejects over-cap, foreign-squad, banned, over-budget and double retention", async () => {
    const put = (franchiseId: string, items: { playerId: string; price: string }[]) =>
      callCode(putFranchiseRetentions, { id: targetId, franchiseId }, { items });

    // Over the cap of 2.
    expect(
      await put(franchiseAId, [
        { playerId: aPlayers[0]!, price: "1" },
        { playerId: aPlayers[1]!, price: "1" },
        { playerId: bPlayers[0]!, price: "1" },
      ]),
    ).toBe("VALIDATION_ERROR");

    // Another franchise's player.
    expect(await put(franchiseAId, [{ playerId: bPlayers[0]!, price: "1" }])).toBe("VALIDATION_ERROR");

    // Banned player.
    await prisma.playerLeagueStatus.create({
      data: {
        playerId: aPlayers[1]!,
        leagueId: (await prisma.season.findUniqueOrThrow({ where: { id: g.auction.seasonId } }))
          .leagueId,
        banned: true,
      },
    });
    expect(await put(franchiseAId, [{ playerId: aPlayers[1]!, price: "1" }])).toBe("VALIDATION_ERROR");
    await prisma.playerLeagueStatus.deleteMany({ where: { playerId: aPlayers[1]! } });

    // Over budget: 19 + 1×unsold(1) = 20 fits, so 19.5 must fail (min 2, 1 kept).
    expect(await put(franchiseAId, [{ playerId: aPlayers[0]!, price: "19.5" }])).toBe("VALIDATION_ERROR");

    // Valid: keep both at edited prices (5 + 4 + 0 remaining-min × 1 ≤ 20).
    expect(
      await put(franchiseAId, [
        { playerId: aPlayers[0]!, price: "5" }, // was 3 — price is editable
        { playerId: aPlayers[1]!, price: "4" },
      ]),
    ).toBe("OK");

    // A player already retained by A cannot be retained by B — rejected by the
    // source-squad gate first (squads never overlap; the CONFLICT branch and
    // the DB unique constraint remain as defense in depth).
    expect(await put(franchiseBId, [{ playerId: aPlayers[0]!, price: "2" }])).toBe(
      "VALIDATION_ERROR",
    );

    // B keeps one player at its old price.
    expect(await put(franchiseBId, [{ playerId: bPlayers[1]!, price: "6" }])).toBe("OK");
  });

  it("blocks adding a retained player to the lot list and vice versa", async () => {
    // Retained player as a lot → the retention PUT must reject it.
    const lot = await prisma.auctionPlayer.create({
      data: { auctionId: targetId, playerId: bPlayers[0]!, basePrice: "2" },
    });
    expect(
      await callCode(
        putFranchiseRetentions,
        { id: targetId, franchiseId: franchiseBId },
        { items: [{ playerId: bPlayers[0]!, price: "1" }, { playerId: bPlayers[1]!, price: "6" }] },
      ),
    ).toBe("VALIDATION_ERROR");
    await prisma.auctionPlayer.delete({ where: { id: lot.id } });
  });

  it("materializes retentions at go-live: RETAINED lots, squad rows, seeded tallies", async () => {
    await call(goLive, { id: targetId });

    const auction = await prisma.auction.findUniqueOrThrow({ where: { id: targetId } });
    expect(auction.status).toBe("LIVE");

    const teams = await prisma.team.findMany({
      where: { auctionId: targetId },
      include: { players: true },
    });
    const teamA = teams.find((t) => t.franchiseId === franchiseAId)!;
    const teamB = teams.find((t) => t.franchiseId === franchiseBId)!;

    // Team A retained 2 players at 5 + 4 = 9; B one at 6.
    expect(teamA.playerCount).toBe(2);
    expect(teamA.committedAmount.equals(dec("9"))).toBe(true);
    expect(teamA.players.map((p) => p.acquiredVia)).toEqual(["RETAINED", "RETAINED"]);
    expect(teamB.playerCount).toBe(1);
    expect(teamB.committedAmount.equals(dec("6"))).toBe(true);

    // RETAINED lots: sold to the team at the retention price, no queue position,
    // overseas flag carried from the source auction.
    const retainedLots = await prisma.auctionPlayer.findMany({
      where: { auctionId: targetId, status: "RETAINED" },
    });
    expect(retainedLots).toHaveLength(3);
    for (const lot of retainedLots) {
      expect(lot.lotOrder).toBeNull();
      expect(lot.soldToTeamId).not.toBeNull();
      expect(lot.soldPrice?.equals(lot.basePrice)).toBe(true);
    }
    const overseasRetained = retainedLots.find((l) => l.playerId === bPlayers[1]);
    expect(overseasRetained?.isOverseas).toBe(true);

    // The live snapshot never shows RETAINED lots in the queue, but counts them.
    const snapshot = await buildStateSnapshot(targetId);
    expect(snapshot.lots.items.some((l) => l.status === "RETAINED")).toBe(false);
    expect(snapshot.lots.items).toHaveLength(2); // the two real lots
    expect(snapshot.lots.counts.RETAINED).toBe(3);
    expect(snapshot.lots.counts.PENDING).toBe(2);
  });

  it("locks retention edits once the auction is live", async () => {
    expect(
      await callCode(
        putFranchiseRetentions,
        { id: targetId, franchiseId: franchiseAId },
        { items: [] },
      ),
    ).toBe("INVALID_STATE");
    expect(
      await callCode(putRetentionSource, { id: targetId }, { sourceAuctionId: null }),
    ).toBe("INVALID_STATE");
  });
});
