import { describe, it, expect, beforeEach, vi } from "vitest";
import { money } from "../lib/money.js";
import { AppError } from "../lib/errors.js";

// In-memory stand-in for the DB. The mocked updateMany reproduces the SQL CAS
// (UPDATE … WHERE id=? AND version=? AND status='ON_BLOCK'): it succeeds only
// when the lot's version still matches, which is the sole serialization point
// for competing bids. Node is single-threaded, so racing placeBid() promises
// interleave at await boundaries — exactly the condition we want to prove safe.
const h = vi.hoisted(() => ({
  store: {
    lot: null as Record<string, unknown> | null,
    auction: null as Record<string, unknown> | null,
    teams: {} as Record<string, Record<string, unknown>>,
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    auction: { findUnique: async () => h.store.auction },
    auctionPlayer: { findUnique: async () => ({ ...h.store.lot }) },
    team: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        h.store.teams[where.id] ? { ...h.store.teams[where.id] } : null,
    },
    bid: { findFirst: async () => null },
    $transaction: async (
      cb: (tx: {
        auctionPlayer: {
          updateMany: (a: {
            where: { id: string; version: number; status: string };
            data: { currentPrice: unknown; leadingTeamId: string };
          }) => Promise<{ count: number }>;
        };
        bid: { create: (a: unknown) => Promise<{ createdAt: Date }> };
      }) => Promise<unknown>,
    ) =>
      cb({
        auctionPlayer: {
          updateMany: async ({
            where,
            data,
          }: {
            where: { id: string; version: number; status: string };
            data: { currentPrice: unknown; leadingTeamId: string };
          }) => {
            const lot = h.store.lot!;
            if (
              lot.id === where.id &&
              lot.version === where.version &&
              lot.status === where.status
            ) {
              lot.version = (lot.version as number) + 1;
              lot.currentPrice = data.currentPrice;
              lot.leadingTeamId = data.leadingTeamId;
              return { count: 1 };
            }
            return { count: 0 };
          },
        },
        bid: { create: async () => ({ createdAt: new Date() }) },
      }),
  },
}));

const { placeBid } = await import("./bid-pipeline.js");

function seed() {
  h.store.lot = {
    id: "lot1",
    auctionId: "auc1",
    playerId: "p1",
    basePrice: money("2"),
    status: "ON_BLOCK",
    round: "MAIN",
    currentPrice: null,
    leadingTeamId: null,
    version: 0,
  };
  h.store.auction = {
    id: "auc1",
    status: "LIVE",
    biddingMode: "FRANCHISE",
    currentAuctionPlayerId: "lot1",
    currentLotEndsAt: new Date(Date.now() + 60_000),
    rules: {
      creditPerTeam: money("100"),
      minPlayersPerTeam: 1,
      maxPlayersPerTeam: 25,
      unsoldPrice: money("0.5"),
    },
    incrementTiers: [{ fromAmount: money("0"), increment: money("0.5") }],
    season: { league: { organizerId: "org1" } },
  };
  h.store.teams = {
    A: {
      id: "A",
      auctionId: "auc1",
      ownerUserId: "uA",
      committedAmount: money("0"),
      playerCount: 0,
    },
    B: {
      id: "B",
      auctionId: "auc1",
      ownerUserId: "uB",
      committedAmount: money("0"),
      playerCount: 0,
    },
  };
}

beforeEach(seed);

const bid = (team: "A" | "B", owner: string, amount: string, version: number) =>
  placeBid(
    { id: owner, role: "FRANCHISE" },
    {
      auctionId: "auc1",
      auctionPlayerId: "lot1",
      teamId: team,
      amount,
      version,
      clientBidId: `${owner}-${version}-${amount}`,
    },
  );

describe("placeBid concurrency (optimistic CAS)", () => {
  it("accepts exactly one of two simultaneous opening bids", async () => {
    const results = await Promise.allSettled([bid("A", "uA", "2", 0), bid("B", "uB", "2", 0)]);
    const accepted = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser lost the race, not a validation gate.
    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("OUTBID");
    // The lot advanced exactly one version — no double-accept.
    expect(h.store.lot!.version).toBe(1);
  });

  it("rejects a stale-version bid and accepts the correctly-versioned next bid", async () => {
    const first = await bid("A", "uA", "2", 0);
    expect(first.currentPrice).toBe("2.0000");
    expect(h.store.lot!.version).toBe(1);

    // Correct next amount (2.5) but asserting the stale version 0 → loses the CAS.
    await expect(bid("B", "uB", "2.5", 0)).rejects.toMatchObject({ code: "OUTBID" });
    expect(h.store.lot!.version).toBe(1);

    // Same amount at the current version 1 → accepted.
    const second = await bid("B", "uB", "2.5", 1);
    expect(second.currentPrice).toBe("2.5000");
    expect(second.leadingTeamId).toBe("B");
    expect(h.store.lot!.version).toBe(2);
  });
});
