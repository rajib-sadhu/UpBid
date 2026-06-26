import type { TeamPlayer, Player, AuctionPlayer, LineupMember, Lineup } from "@prisma/client";
import type { SquadPlayer, LineupMemberDTO, LineupDTO } from "shared";
import { moneyToWire } from "../../lib/money.js";

type SquadRow = TeamPlayer & {
  player: Pick<Player, "id" | "name" | "footballPosition">;
  auctionPlayer: Pick<AuctionPlayer, "isOverseas">;
};

export function toSquadPlayer(tp: SquadRow): SquadPlayer {
  return {
    teamPlayerId: tp.id,
    playerId: tp.playerId,
    playerName: tp.player.name,
    footballPosition: tp.player.footballPosition,
    isOverseas: tp.auctionPlayer.isOverseas,
    price: moneyToWire(tp.price),
    acquiredVia: tp.acquiredVia,
  };
}

type MemberRow = LineupMember & {
  teamPlayer: SquadRow;
};

export function toLineupMemberDTO(m: MemberRow): LineupMemberDTO {
  return {
    teamPlayerId: m.teamPlayerId,
    playerId: m.teamPlayer.playerId,
    playerName: m.teamPlayer.player.name,
    footballPosition: m.teamPlayer.player.footballPosition,
    isOverseas: m.teamPlayer.auctionPlayer.isOverseas,
    membership: m.membership,
    battingOrder: m.battingOrder,
    isWicketkeeper: m.isWicketkeeper,
    isFirstBowler: m.isFirstBowler,
    isSecondBowler: m.isSecondBowler,
    isCaptain: m.isCaptain,
    isViceCaptain: m.isViceCaptain,
    assignedPosition: m.assignedPosition,
  };
}

export function toLineupDTO(
  teamId: string,
  teamName: string,
  lineup: (Lineup & { members: MemberRow[] }) | null,
): LineupDTO {
  return {
    teamId,
    teamName,
    status: lineup?.status ?? "DRAFT",
    formationId: lineup?.formationId ?? null,
    lockedAt: lineup?.lockedAt ? lineup.lockedAt.toISOString() : null,
    members: lineup ? lineup.members.map(toLineupMemberDTO) : [],
  };
}
