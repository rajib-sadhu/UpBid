import type { Season as PrismaSeason } from "@prisma/client";
import type { Season } from "shared";

type SeasonWithCount = PrismaSeason & { _count?: { auctions: number } };

const dateOnly = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function toSeason(s: SeasonWithCount): Season {
  return {
    id: s.id,
    name: s.name,
    leagueId: s.leagueId,
    startDate: dateOnly(s.startDate),
    endDate: dateOnly(s.endDate),
    auctionCount: s._count?.auctions,
    createdAt: s.createdAt.toISOString(),
  };
}
