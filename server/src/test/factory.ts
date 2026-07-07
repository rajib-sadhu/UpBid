import type { PrismaClient, User, Team, AuctionPlayer, Auction } from "@prisma/client";

/**
 * Seed a complete, self-contained auction graph directly through Prisma:
 * organizer → league → season → franchises (with owner users) → LIVE auction
 * with rules, one increment tier, teams and pending lots. Every run gets a
 * unique `tag` so graphs never collide inside the shared _itest database.
 */
export interface SeedOptions {
  tag: string;
  teams?: number;
  players?: number;
  rules?: Partial<{
    creditPerTeam: string;
    minPlayersPerTeam: number;
    maxPlayersPerTeam: number;
    unsoldPrice: string;
    defaultLotDurationSec: number;
  }>;
  increment?: string;
  basePrice?: string;
}

export interface SeededGraph {
  organizer: User;
  owners: User[];
  auction: Auction;
  teams: Team[];
  lots: AuctionPlayer[];
}

const CODES = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH"];

export async function seedAuctionGraph(
  prisma: PrismaClient,
  opts: SeedOptions,
): Promise<SeededGraph> {
  const { tag } = opts;
  const teamCount = opts.teams ?? 4;
  const playerCount = opts.players ?? 6;
  const rules = {
    creditPerTeam: "100",
    minPlayersPerTeam: 1,
    maxPlayersPerTeam: 25,
    unsoldPrice: "0.5",
    defaultLotDurationSec: 300,
    ...opts.rules,
  };

  const organizer = await prisma.user.create({
    data: {
      email: `org-${tag}@itest.local`,
      name: `Organizer ${tag}`,
      passwordHash: "not-a-real-hash",
      role: "ORGANIZER",
      status: "ACTIVE",
    },
  });

  const league = await prisma.league.create({
    data: { name: `League ${tag}`, shortName: "ITL", sport: "CRICKET", organizerId: organizer.id },
  });
  const season = await prisma.season.create({
    data: { name: `Season ${tag}`, leagueId: league.id },
  });

  const owners: User[] = [];
  const teams: Team[] = [];
  for (let i = 0; i < teamCount; i++) {
    const owner = await prisma.user.create({
      data: {
        email: `owner${i}-${tag}@itest.local`,
        name: `Owner ${i} ${tag}`,
        passwordHash: "not-a-real-hash",
        role: "FRANCHISE",
        status: "ACTIVE",
        createdById: organizer.id,
      },
    });
    owners.push(owner);
  }

  const auction = await prisma.auction.create({
    data: {
      name: `Auction ${tag}`,
      seasonId: season.id,
      status: "LIVE",
      biddingMode: "FRANCHISE",
      rules: { create: rules },
      incrementTiers: { create: [{ fromAmount: "0", increment: opts.increment ?? "0.5" }] },
    },
  });

  for (let i = 0; i < teamCount; i++) {
    const franchise = await prisma.franchise.create({
      data: {
        leagueId: league.id,
        name: `Team ${CODES[i]} ${tag}`,
        shortName: CODES[i],
        primaryColor: "#2563eb",
        ownerUserId: owners[i].id,
      },
    });
    await prisma.seasonFranchise.create({
      data: { seasonId: season.id, franchiseId: franchise.id },
    });
    teams.push(
      await prisma.team.create({ data: { auctionId: auction.id, franchiseId: franchise.id } }),
    );
  }

  const lots: AuctionPlayer[] = [];
  for (let i = 0; i < playerCount; i++) {
    const player = await prisma.player.create({
      data: { name: `Player ${i} ${tag}`, sport: "CRICKET", cricketRole: "BATSMAN" },
    });
    lots.push(
      await prisma.auctionPlayer.create({
        data: {
          auctionId: auction.id,
          playerId: player.id,
          basePrice: opts.basePrice ?? "2",
          lotOrder: i + 1,
        },
      }),
    );
  }

  return { organizer, owners, auction, teams, lots };
}
