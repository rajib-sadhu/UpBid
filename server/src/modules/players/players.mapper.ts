import type { Player as PrismaPlayer, PlayerLeagueStatus } from "@prisma/client";
import type { Player, LeaguePlayer } from "shared";

const dateOnly = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function toPlayer(p: PrismaPlayer): Player {
  return {
    id: p.id,
    name: p.name,
    sport: p.sport,
    role: p.role,
    nationality: p.nationality,
    dateOfBirth: dateOnly(p.dateOfBirth),
    photoUrl: p.photoUrl,
    externalRef: p.externalRef,
    footballPosition: p.footballPosition,
    footballDetailPosition: p.footballDetailPosition,
    cricketRole: p.cricketRole,
    battingPosition: p.battingPosition,
    bowlingStyle: p.bowlingStyle,
    allRounderType: p.allRounderType,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toLeaguePlayer(
  p: PrismaPlayer & { leagueStatuses?: PlayerLeagueStatus[] },
): LeaguePlayer {
  const status = p.leagueStatuses?.[0];
  return {
    ...toPlayer(p),
    banned: status?.banned ?? false,
    bannedReason: status?.bannedReason ?? null,
  };
}
