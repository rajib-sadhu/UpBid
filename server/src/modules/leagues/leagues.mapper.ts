import type { League as PrismaLeague } from "@prisma/client";
import type { League } from "shared";

type LeagueWithCount = PrismaLeague & { _count?: { seasons: number } };

export function toLeague(l: LeagueWithCount): League {
  return {
    id: l.id,
    name: l.name,
    sport: l.sport,
    organizerId: l.organizerId,
    seasonCount: l._count?.seasons,
    createdAt: l.createdAt.toISOString(),
  };
}
