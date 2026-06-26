import { prisma } from "../../lib/prisma.js";

/**
 * Resolve the organizer (owner) of a league for ownership checks. Returns null if the
 * league does not exist. SUPER_ADMIN bypasses this in requireOwnership.
 */
export async function leagueOwnerId(leagueId: string): Promise<string | null> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { organizerId: true },
  });
  return league?.organizerId ?? null;
}
