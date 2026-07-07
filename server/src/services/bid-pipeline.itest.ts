import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { placeBid } from "./bid-pipeline.js";
import { openLot } from "./lot.js";
import { seedAuctionGraph, type SeededGraph } from "../test/factory.js";
import type { AuthUser } from "../auth/types.js";

// ===========================================================================
// Phase 9 concurrency proof — the real thing, against MySQL. The unit suite
// (bid-pipeline.test.ts) proves the pipeline logic over a mocked CAS; this
// suite proves the actual serialization point: the conditional UPDATE on
// AuctionPlayer.version executed by InnoDB under genuinely concurrent
// transactions (Prisma connection pool ⇒ parallel connections). The invariant:
// for any burst of simultaneous bids, exactly one is accepted per version.
// ===========================================================================

const dec = (v: string) => new Prisma.Decimal(v);

function bidder(g: SeededGraph, i: number): { user: AuthUser; teamId: string } {
  return { user: { id: g.owners[i]!.id, role: "FRANCHISE" }, teamId: g.teams[i]!.id };
}

/** Fire one bid; resolve to "ACCEPTED" or the rejection code. */
async function tryBid(
  g: SeededGraph,
  i: number,
  lotId: string,
  amount: string,
  version: number,
  idTag: string,
): Promise<string> {
  const { user, teamId } = bidder(g, i);
  try {
    await placeBid(user, {
      auctionId: g.auction.id,
      auctionPlayerId: lotId,
      teamId,
      amount,
      version,
      clientBidId: `itest-${idTag}`,
    });
    return "ACCEPTED";
  } catch (e) {
    return (e as { code?: string }).code ?? "UNKNOWN";
  }
}

describe("bid pipeline vs real MySQL — no double-accept", () => {
  let g: SeededGraph;
  let lotId: string;

  beforeAll(async () => {
    g = await seedAuctionGraph(prisma, { tag: `cas${Date.now().toString(36)}`, teams: 4 });
    lotId = g.lots[0]!.id;
    await openLot(g.auction.id, lotId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("accepts exactly one of a burst of simultaneous opening bids", async () => {
    // 8 concurrent openers: every team fires twice, all asserting version 0.
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, (_, k) => tryBid(g, k % 4, lotId, "2", 0, `open-${k}`)),
    );

    expect(outcomes.filter((o) => o === "ACCEPTED")).toHaveLength(1);
    // Losers fail a race gate, never a double-accept: OUTBID (lost the CAS) or
    // BAD_AMOUNT (read the lot after the winner committed, so the opening
    // price no longer matches).
    for (const o of outcomes) expect(["ACCEPTED", "OUTBID", "BAD_AMOUNT"]).toContain(o);

    const lot = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: lotId } });
    expect(lot.version).toBe(1);
    expect(lot.currentPrice?.equals(dec("2"))).toBe(true);
    expect(lot.leadingTeamId).not.toBeNull();
    expect(await prisma.bid.count({ where: { auctionPlayerId: lotId } })).toBe(1);
  });

  it("sustains a multi-round barrage: one winner per version, strictly increasing price", async () => {
    for (let round = 0; round < 10; round++) {
      const lot = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: lotId } });
      const next = lot.currentPrice!.plus(dec("0.5")).toString();
      const outcomes = await Promise.all(
        Array.from({ length: 4 }, (_, i) => tryBid(g, i, lotId, next, lot.version, `r${round}-t${i}`)),
      );
      expect(outcomes.filter((o) => o === "ACCEPTED")).toHaveLength(1);
    }

    const lot = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: lotId } });
    const bids = await prisma.bid.findMany({
      where: { auctionPlayerId: lotId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    // Version counts accepted bids exactly — one accept per CAS win.
    expect(bids).toHaveLength(11); // opening + 10 rounds
    expect(lot.version).toBe(11);
    // Ladder is strictly increasing with no duplicates or gaps: 2, 2.5, … 7.
    bids.forEach((b, i) => {
      expect(b.amount.equals(dec("2").plus(dec("0.5").times(i)))).toBe(true);
    });
    // The leader is the team that placed the final accepted bid.
    expect(lot.leadingTeamId).toBe(bids[bids.length - 1]!.teamId);
    expect(lot.currentPrice?.equals(dec("7"))).toBe(true);
  });

  it("rejects a stale-version bid outright", async () => {
    const lot = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: lotId } });
    const next = lot.currentPrice!.plus(dec("0.5")).toString();
    expect(await tryBid(g, 0, lotId, next, lot.version - 1, "stale")).toBe("OUTBID");
    const after = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: lotId } });
    expect(after.version).toBe(lot.version);
  });

  it("ignores a replayed clientBidId (idempotent retry)", async () => {
    const lot = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: lotId } });
    const next = lot.currentPrice!.plus(dec("0.5")).toString();
    expect(await tryBid(g, 1, lotId, next, lot.version, "dup")).toBe("ACCEPTED");

    const after = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: lotId } });
    const retry = after.currentPrice!.plus(dec("0.5")).toString();
    expect(await tryBid(g, 1, lotId, retry, after.version, "dup")).toBe("DUPLICATE_BID");
    expect(await prisma.bid.count({ where: { auctionPlayerId: lotId, clientBidId: "itest-dup" } })).toBe(1);
  });

  it("enforces the reserve cap through the real pipeline", async () => {
    // Fresh tight-budget auction: credit 2.5, min 1 ⇒ max bid is 2.5 flat.
    const tight = await seedAuctionGraph(prisma, {
      tag: `rsv${Date.now().toString(36)}`,
      teams: 2,
      players: 1,
      rules: { creditPerTeam: "2.5" },
    });
    const tightLot = tight.lots[0]!.id;
    await openLot(tight.auction.id, tightLot);

    expect(await tryBid(tight, 0, tightLot, "2", 0, "rsv-open")).toBe("ACCEPTED");
    expect(await tryBid(tight, 1, tightLot, "2.5", 1, "rsv-cap")).toBe("ACCEPTED");
    // Next required amount is 3 — beyond every team's reserve.
    expect(await tryBid(tight, 0, tightLot, "3", 2, "rsv-over")).toBe("RESERVE_EXCEEDED");
  });
});
