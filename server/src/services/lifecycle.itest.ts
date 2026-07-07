import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { placeBid } from "./bid-pipeline.js";
import { openLot } from "./lot.js";
import { finalizeLot } from "./finalize.js";
import { advancePhase } from "./phase.js";
import { assignPlayer, assignmentState } from "./assignment.js";
import { seedAuctionGraph, type SeededGraph } from "../test/factory.js";
import type { AuthUser } from "../auth/types.js";

// ===========================================================================
// Phase 9 auction-lifecycle integration test (build-plan §9), against real
// MySQL: LIVE bidding → SOLD/UNSOLD → RE_AUCTION sweep (unsold-price opening)
// → ASSIGNMENT (min-player gate, turn rotation, choose + force-assign) →
// COMPLETED (terminal lot states, every team at the minimum). Exercises the
// same service layer the Socket.io gateway drives.
// ===========================================================================

const dec = (v: string) => new Prisma.Decimal(v);

describe("auction lifecycle: LIVE → RE_AUCTION → ASSIGNMENT → COMPLETED", () => {
  let g: SeededGraph;
  let organizer: AuthUser;

  const ownerOf = (teamId: string): AuthUser => {
    const i = g.teams.findIndex((t) => t.id === teamId);
    return { id: g.owners[i].id, role: "FRANCHISE" };
  };

  const bid = (ownerIdx: number, lotId: string, amount: string, version: number) =>
    placeBid(
      { id: g.owners[ownerIdx].id, role: "FRANCHISE" },
      {
        auctionId: g.auction.id,
        auctionPlayerId: lotId,
        teamId: g.teams[ownerIdx].id,
        amount,
        version,
        clientBidId: `life-${lotId}-${version}`,
      },
    );

  beforeAll(async () => {
    g = await seedAuctionGraph(prisma, {
      tag: `life${Date.now().toString(36)}`,
      teams: 2,
      players: 6,
      rules: { creditPerTeam: "20", minPlayersPerTeam: 2, maxPlayersPerTeam: 3, unsoldPrice: "1" },
    });
    organizer = { id: g.organizer.id, role: "ORGANIZER" };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("runs a live lot to SOLD: bid war, finalize, tallies committed atomically", async () => {
    const lot = g.lots[0].id;
    await openLot(g.auction.id, lot);

    const first = await bid(0, lot, "2", 0); // opening = base price
    expect(first.requiredNextBid).toBe("2.50");
    await bid(1, lot, "2.5", 1);
    await bid(0, lot, "3", 2);

    const result = await finalizeLot(g.auction.id, lot, "SELL");
    expect(result.type).toBe("SOLD");

    const [sold, team, acquisition, auction] = await Promise.all([
      prisma.auctionPlayer.findUniqueOrThrow({ where: { id: lot } }),
      prisma.team.findUniqueOrThrow({ where: { id: g.teams[0].id } }),
      prisma.teamPlayer.findUniqueOrThrow({ where: { auctionPlayerId: lot } }),
      prisma.auction.findUniqueOrThrow({ where: { id: g.auction.id } }),
    ]);
    expect(sold.status).toBe("SOLD");
    expect(sold.soldToTeamId).toBe(g.teams[0].id);
    expect(sold.soldPrice?.equals(dec("3"))).toBe(true);
    expect(team.committedAmount.equals(dec("3"))).toBe(true);
    expect(team.playerCount).toBe(1);
    expect(acquisition.acquiredVia).toBe("AUCTION");
    expect(auction.currentAuctionPlayerId).toBeNull(); // block is empty again
  });

  it("refuses to SELL a bid-less lot (NO_LEADER) and closes it UNSOLD instead", async () => {
    const lot = g.lots[1].id;
    await openLot(g.auction.id, lot);

    await expect(finalizeLot(g.auction.id, lot, "SELL")).rejects.toMatchObject({
      code: "NO_LEADER",
    });
    const result = await finalizeLot(g.auction.id, lot, "UNSOLD");
    expect(result.type).toBe("UNSOLD");
    const closed = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: lot } });
    expect(closed.status).toBe("UNSOLD");
  });

  it("blocks phase transitions while a lot is on the block", async () => {
    const lot = g.lots[2].id;
    await openLot(g.auction.id, lot);
    await expect(advancePhase(g.auction.id, "RE_AUCTION")).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await finalizeLot(g.auction.id, lot, "UNSOLD");
  });

  it("sweeps unsold + never-opened lots into RE_AUCTION, reopening at the unsold price", async () => {
    const changed = await advancePhase(g.auction.id, "RE_AUCTION");
    expect(changed.status).toBe("RE_AUCTION");

    // Everything not yet won (2 UNSOLD + 3 PENDING) is back in the pool.
    const pool = await prisma.auctionPlayer.findMany({
      where: { auctionId: g.auction.id, status: "PENDING", round: "RE_AUCTION" },
    });
    expect(pool).toHaveLength(5);

    // Re-auction opening price is the unsold price, not the base price.
    const lot = g.lots[1].id;
    await openLot(g.auction.id, lot);
    let rejected = "";
    try {
      await bid(1, lot, "2", 0);
    } catch (e) {
      rejected = (e as { code?: string }).code ?? "";
    }
    expect(rejected).toBe("BAD_AMOUNT");

    await bid(1, lot, "1", 0);
    const result = await finalizeLot(g.auction.id, lot, "SELL");
    expect(result.type).toBe("SOLD");
    const acquisition = await prisma.teamPlayer.findUniqueOrThrow({
      where: { auctionPlayerId: lot },
    });
    expect(acquisition.acquiredVia).toBe("REAUCTION");
    expect(acquisition.price.equals(dec("1"))).toBe(true);
  });

  it("gates COMPLETED on the minimum and fills squads via choose + force-assign", async () => {
    const changed = await advancePhase(g.auction.id, "ASSIGNMENT");
    expect(changed.status).toBe("ASSIGNMENT");
    expect(changed.assignment).not.toBeNull();

    // Both teams hold 1 player, below the minimum of 2 → COMPLETED must refuse.
    await expect(advancePhase(g.auction.id, "COMPLETED")).rejects.toMatchObject({
      code: "MIN_NOT_MET",
    });

    // Franchise picks rotate: the team at the head of the queue chooses; the
    // other owner is told to wait their turn.
    const { pickQueue } = await assignmentState(g.auction.id);
    expect(pickQueue).toHaveLength(2);
    const [firstTeam, secondTeam] = pickQueue;
    const available = await prisma.auctionPlayer.findMany({
      where: { auctionId: g.auction.id, status: { in: ["PENDING", "UNSOLD"] } },
      orderBy: { lotOrder: "asc" },
    });

    await expect(
      assignPlayer(ownerOf(secondTeam), {
        auctionId: g.auction.id,
        auctionPlayerId: available[0].id,
        teamId: secondTeam,
      }),
    ).rejects.toMatchObject({ code: "NOT_YOUR_TURN" });

    const chosen = await assignPlayer(ownerOf(firstTeam), {
      auctionId: g.auction.id,
      auctionPlayerId: available[0].id,
      teamId: firstTeam,
    });
    expect(chosen.acquiredVia).toBe("CHOSEN");

    // The organizer force-assigns the other team up to the minimum.
    const forced = await assignPlayer(organizer, {
      auctionId: g.auction.id,
      auctionPlayerId: available[1].id,
      teamId: secondTeam,
    });
    expect(forced.acquiredVia).toBe("FORCE_ASSIGNED");

    // Both assignments were priced at the unsold price.
    for (const lotId of [available[0].id, available[1].id]) {
      const row = await prisma.teamPlayer.findUniqueOrThrow({ where: { auctionPlayerId: lotId } });
      expect(row.price.equals(dec("1"))).toBe(true);
    }
  });

  it("completes: terminal lot states, minimums met, tallies consistent", async () => {
    const changed = await advancePhase(g.auction.id, "COMPLETED");
    expect(changed.status).toBe("COMPLETED");

    // Every lot is terminal — anything never opened was recorded UNSOLD.
    const lots = await prisma.auctionPlayer.findMany({ where: { auctionId: g.auction.id } });
    expect(lots).toHaveLength(6);
    for (const lot of lots) {
      expect(["SOLD", "UNSOLD", "ASSIGNED"]).toContain(lot.status);
    }

    // Every team meets the minimum, and committedAmount equals the sum of its
    // acquisition prices — the money invariant survived the whole lifecycle.
    const teams = await prisma.team.findMany({
      where: { auctionId: g.auction.id },
      include: { players: true },
    });
    for (const team of teams) {
      expect(team.playerCount).toBeGreaterThanOrEqual(2);
      expect(team.playerCount).toBe(team.players.length);
      const spent = team.players.reduce((sum, p) => sum.plus(p.price), dec("0"));
      expect(team.committedAmount.equals(spent)).toBe(true);
    }
  });
});
