import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { toTeam } from "./teams.mapper.js";

// Teams are per-auction participations materialized at go-live from the season's
// selected franchises (see auctions.controller goLive). They are not created or
// edited directly — manage franchises on the league page and participation on
// the season page. This endpoint is read-only (auction setup, live, monitor).
const teamInclude = {
  franchise: { include: { owner: { select: { name: true, email: true } } } },
};

// GET /api/auctions/:id/teams
export async function listTeams(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  const teams = await prisma.team.findMany({
    where: { auctionId },
    orderBy: { createdAt: "asc" },
    include: teamInclude,
  });
  res.json(teams.map(toTeam));
}
