import type { AuctionPlayer, Player, Formation as PrismaFormation } from "@prisma/client";
import type { Lot, Formation } from "shared";
import { moneyToWire } from "../../lib/money.js";

type LotWithPlayer = AuctionPlayer & { player: Player };

export function toLot(l: LotWithPlayer): Lot {
  return {
    id: l.id,
    auctionId: l.auctionId,
    playerId: l.playerId,
    playerName: l.player.name,
    sport: l.player.sport,
    footballPosition: l.player.footballPosition,
    basePrice: moneyToWire(l.basePrice),
    isOverseas: l.isOverseas,
    status: l.status,
    round: l.round,
    lotOrder: l.lotOrder,
    createdAt: l.createdAt.toISOString(),
  };
}

export function toFormation(f: PrismaFormation): Formation {
  return { id: f.id, name: f.name, numGK: f.numGK, numDef: f.numDef, numMid: f.numMid, numFwd: f.numFwd };
}
