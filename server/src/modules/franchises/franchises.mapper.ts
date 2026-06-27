import type { Franchise as PrismaFranchise, User } from "@prisma/client";
import type { Franchise } from "shared";

type FranchiseWithOwner = PrismaFranchise & {
  owner?: Pick<User, "name" | "email"> | null;
};

export function toFranchise(f: FranchiseWithOwner): Franchise {
  return {
    id: f.id,
    leagueId: f.leagueId,
    name: f.name,
    shortName: f.shortName,
    primaryColor: f.primaryColor,
    secondaryColor: f.secondaryColor,
    logoUrl: f.logoUrl,
    ownerUserId: f.ownerUserId,
    ownerName: f.owner?.name ?? null,
    ownerEmail: f.owner?.email ?? null,
    createdAt: f.createdAt.toISOString(),
  };
}
