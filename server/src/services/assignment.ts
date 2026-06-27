import type { AssignPlayerPayload, PlayerAssignedEvent, LotCounts } from "shared";
import type { AuthUser } from "../auth/types.js";
import { prisma } from "../lib/prisma.js";
import { Errors, AppError } from "../lib/errors.js";
import { add, lte, moneyToWire } from "../lib/money.js";
import { auctionOwnerId } from "../realtime/authz.js";
import { toLiveLot, toTeamTally, toLotCounts, type LotWithPlayer } from "../realtime/mappers.js";

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
  };
}
