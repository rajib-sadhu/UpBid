import type { Team as PrismaTeam, Franchise, User } from "@prisma/client";
import type { Team } from "shared";
import { moneyToWire } from "../../lib/money.js";

type TeamWithFranchise = PrismaTeam & {
  franchise: Franchise & { owner?: Pick<User, "name" | "email"> | null };
};

// Identity fields (name/short/color/logo/owner) come from the league Franchise;
// Team contributes only the per-auction tallies.
export function toTeam(t: TeamWithFranchise): Team {
  return {
    id: t.id,
    auctionId: t.auctionId,
    franchiseId: t.franchiseId,
    ownerUserId: t.franchise.ownerUserId,
    ownerName: t.franchise.owner?.name ?? null,
    ownerEmail: t.franchise.owner?.email ?? null,
    name: t.franchise.name,
    shortName: t.franchise.shortName,
    primaryColor: t.franchise.primaryColor,
    secondaryColor: t.franchise.secondaryColor,
    logoUrl: t.franchise.logoUrl,
    committedAmount: moneyToWire(t.committedAmount),
    playerCount: t.playerCount,
    createdAt: t.createdAt.toISOString(),
  };
}
