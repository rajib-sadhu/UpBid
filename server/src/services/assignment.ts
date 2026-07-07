import type { AssignPlayerPayload, PlayerAssignedEvent, AssignmentState, LotCounts } from "shared";
import type { AuthUser } from "../auth/types.js";
import { prisma } from "../lib/prisma.js";
import { Errors, AppError } from "../lib/errors.js";
import { add, lte, moneyToWire, type Money } from "../lib/money.js";
import { auctionOwnerId } from "../realtime/authz.js";
import { toLiveLot, toTeamTally, toLotCounts, type LotWithPlayer } from "../realtime/mappers.js";

// ---- Pick rotation ---------------------------------------------------------
// Teams take remaining players ONE AT A TIME in a fixed rotation. The order is
// set once, at the start of assignment: most free slots first, alphabetical
// (franchise name) on ties. Then picks alternate — 1st team, 2nd, …, last,
// and around again — so a team that starts several slots behind cannot take
// them all in a row. Every player a team receives during assignment (self-pick
// or organizer force-assign) counts as its turn. Teams that are full, cannot
// afford the unsold price, or were skipped by the organizer drop out and the
// rest continue in the same order.
//
// Both the entry order and the turn position are derived, not stored: CHOSEN /
// FORCE_ASSIGNED acquisitions only ever happen in this phase, so a team's
// picks-so-far is their count, and its entry squad size is playerCount minus
// that. Restart-safe with no cursor. Skips are in-memory only — they reset on
// phase change and on server restart (assignment is short and supervised).

const skipsByAuction = new Map<string, Set<string>>();

export function clearAssignSkips(auctionId: string): void {
  skipsByAuction.delete(auctionId);
}

/** Toggle a team out of / back into the rotation. */
export function toggleAssignSkip(auctionId: string, teamId: string): void {
  const set = skipsByAuction.get(auctionId) ?? new Set<string>();
  if (set.has(teamId)) set.delete(teamId);
  else set.add(teamId);
  skipsByAuction.set(auctionId, set);
}

interface QueueTeam {
  id: string;
  playerCount: number;
  /** Players received during this assignment phase (CHOSEN + FORCE_ASSIGNED). */
  picks: number;
  committedAmount: Money;
  franchise: { name: string };
}
interface QueueRules {
  maxPlayersPerTeam: number;
  unsoldPrice: Money;
  creditPerTeam: Money;
}

/** Ordered ids of teams still eligible to receive a player; index 0 picks now. */
export function pickQueueFrom(
  teams: QueueTeam[],
  rules: QueueRules,
  skipped: ReadonlySet<string>,
): string[] {
  return teams
    .filter(
      (t) =>
        !skipped.has(t.id) &&
        t.playerCount < rules.maxPlayersPerTeam &&
        lte(add(t.committedAmount, rules.unsoldPrice), rules.creditPerTeam),
    )
    .sort(
      (a, b) =>
        // Fewest picks this phase first — one-by-one rotation.
        a.picks - b.picks ||
        // Within a round: the fixed entry order — fewest players at phase
        // entry (= most free slots then), alphabetical on ties.
        a.playerCount - a.picks - (b.playerCount - b.picks) ||
        a.franchise.name.localeCompare(b.franchise.name),
    )
    .map((t) => t.id);
}

/** Current rotation for an auction, from live team tallies. */
export async function assignmentState(auctionId: string): Promise<AssignmentState> {
  const [teams, rules] = await Promise.all([
    prisma.team.findMany({
      where: { auctionId },
      include: { franchise: { select: { name: true } } },
    }),
    prisma.auctionRules.findUnique({ where: { auctionId } }),
  ]);
  const picked = await prisma.teamPlayer.groupBy({
    by: ["teamId"],
    where: { teamId: { in: teams.map((t) => t.id) }, acquiredVia: { in: ["CHOSEN", "FORCE_ASSIGNED"] } },
    _count: true,
  });
  const picksByTeam = new Map(picked.map((p) => [p.teamId, p._count]));
  const skipped = skipsByAuction.get(auctionId) ?? new Set<string>();
  return {
    pickQueue: rules
      ? pickQueueFrom(
          teams.map((t) => ({ ...t, picks: picksByTeam.get(t.id) ?? 0 })),
          rules,
          skipped,
        )
      : [],
    skipped: [...skipped],
  };
}

/**
 * ASSIGNMENT-phase player assignment (architecture.md §9). The organizer
 * force-assigns any remaining player to any team (FORCE_ASSIGNED); a franchise
 * owner chooses a player for their own team (CHOSEN). Price = unsoldPrice.
 */
export async function assignPlayer(
  user: AuthUser,
  payload: AssignPlayerPayload,
): Promise<Omit<PlayerAssignedEvent, "seq">> {
  const { auctionId, auctionPlayerId, teamId } = payload;

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { rules: true },
  });
  if (!auction) throw Errors.notFound("Auction not found");
  if (!auction.rules) throw Errors.invalidState("Auction has no rules configured");
  if (auction.status !== "ASSIGNMENT") {
    throw Errors.invalidState("Players can only be assigned during the ASSIGNMENT phase");
  }

  const [lot, team] = await Promise.all([
    prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId } }),
    prisma.team.findUnique({
      where: { id: teamId },
      include: { franchise: { select: { ownerUserId: true } } },
    }),
  ]);
  if (!lot || lot.auctionId !== auctionId) throw Errors.notFound("Lot not found");
  if (!team || team.auctionId !== auctionId) throw Errors.notFound("Team not found");
  if (lot.status !== "PENDING" && lot.status !== "UNSOLD") {
    throw Errors.invalidState("This player is no longer available");
  }

  // AuthZ → determines the acquisition type.
  const isAdmin = user.role === "SUPER_ADMIN";
  const ownerId = await auctionOwnerId(auctionId);
  let acquiredVia: "CHOSEN" | "FORCE_ASSIGNED";
  if (isAdmin || (user.role === "ORGANIZER" && user.id === ownerId)) {
    acquiredVia = "FORCE_ASSIGNED";
  } else if (user.role === "FRANCHISE" && team.franchise.ownerUserId === user.id) {
    acquiredVia = "CHOSEN";
    // Franchises pick in rotation — most free slots first, alphabetical on ties.
    const { pickQueue } = await assignmentState(auctionId);
    if (pickQueue[0] !== teamId) {
      throw new AppError("NOT_YOUR_TURN", "It's not your team's turn to pick", 409);
    }
  } else {
    throw Errors.forbidden("You cannot assign this player");
  }

  // Guards: squad cap + affordability at unsold price.
  if (team.playerCount >= auction.rules.maxPlayersPerTeam) {
    throw new AppError("TEAM_FULL", "Team already has the maximum number of players", 409);
  }
  const price = auction.rules.unsoldPrice;
  if (!lte(add(team.committedAmount, price), auction.rules.creditPerTeam)) {
    throw new AppError("RESERVE_EXCEEDED", "Team cannot afford the unsold price", 409);
  }

  await prisma.$transaction([
    prisma.auctionPlayer.update({
      where: { id: auctionPlayerId },
      data: { status: "ASSIGNED", soldToTeamId: teamId, soldPrice: price },
    }),
    prisma.teamPlayer.create({
      data: { teamId, auctionPlayerId, playerId: lot.playerId, price, acquiredVia },
    }),
    prisma.team.update({
      where: { id: teamId },
      data: { committedAmount: { increment: price }, playerCount: { increment: 1 } },
    }),
  ]);

  const [updatedLot, updatedTeam, grouped] = await Promise.all([
    prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId }, include: { player: true } }),
    prisma.team.findUnique({ where: { id: teamId } }),
    prisma.auctionPlayer.groupBy({ by: ["status"], where: { auctionId }, _count: true }),
  ]);
  const counts: LotCounts = toLotCounts(
    grouped.map((g) => ({ status: g.status, _count: g._count })),
  );

  return {
    auctionPlayerId,
    teamId,
    price: moneyToWire(price),
    acquiredVia,
    team: toTeamTally(updatedTeam!, auction.rules),
    lotCounts: counts,
    lot: toLiveLot(updatedLot as LotWithPlayer),
    assignment: await assignmentState(auctionId),
  };
}
