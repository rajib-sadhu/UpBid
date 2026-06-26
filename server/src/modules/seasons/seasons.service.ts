import { prisma } from "../../lib/prisma.js";

/** Owner of a season = the organizer of its parent league. Null if the season is gone. */
export async function seasonOwnerId(seasonId: string): Promise<string | null> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { league: { select: { organizerId: true } } },
  });
  return season?.league.organizerId ?? null;
}

/** Convert an optional "YYYY-MM-DD" (or "") wire value to a Date or null. */
export function parseDate(value: string | undefined): Date | null {
  return value ? new Date(value) : null;
}
