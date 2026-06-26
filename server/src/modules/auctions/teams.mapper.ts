import type { Team as PrismaTeam, User } from "@prisma/client";
import type { Team } from "shared";
import { moneyToWire } from "../../lib/money.js";

type TeamWithOwner = PrismaTeam & { owner?: Pick<User, "name" | "email"> };

export function toTeam(t: TeamWithOwner): Team {
  return {
    id: t.id,
    auctionId: t.auctionId,
    ownerUserId: t.ownerUserId,
    ownerName: t.owner?.name ?? "",
    ownerEmail: t.owner?.email ?? "",
    name: t.name,
    shortName: t.shortName,
    logoUrl: t.logoUrl,
    committedAmount: moneyToWire(t.committedAmount),
    playerCount: t.playerCount,
    createdAt: t.createdAt.toISOString(),
  };
}
