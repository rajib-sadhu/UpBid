import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import type { CreateTeamInput, UpdateTeamInput } from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { auctionContext, assertDraft } from "./auctions.service.js";
import { publicUrlFor } from "../../uploads/multer.js";
import { toTeam } from "./teams.mapper.js";

const ownerSelect = { owner: { select: { name: true, email: true } } };

async function teamInAuction(auctionId: string, teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.auctionId !== auctionId) throw Errors.notFound("Team not found");
  return team;
}

export async function listTeams(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  const teams = await prisma.team.findMany({
    where: { auctionId },
    orderBy: { createdAt: "asc" },
    include: ownerSelect,
  });
  res.json(teams.map(toTeam));
}

export async function createTeam(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  assertDraft(await auctionContext(auctionId));
  const body = req.body as CreateTeamInput;

  const owner = await prisma.user.findUnique({ where: { id: body.ownerUserId } });
  if (!owner) throw Errors.validation("Selected owner does not exist");
  if (owner.role !== "FRANCHISE") throw Errors.validation("Team owner must be a franchise user");

  try {
    const team = await prisma.team.create({
      data: {
        auctionId,
        ownerUserId: body.ownerUserId,
        name: body.name,
        shortName: body.shortName ? body.shortName : null,
      },
      include: ownerSelect,
    });
    res.status(201).json(toTeam(team));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw Errors.conflict("That franchise already has a team in this auction");
    }
    throw e;
  }
}

export async function updateTeam(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  const teamId = req.params.teamId!;
  assertDraft(await auctionContext(auctionId));
  await teamInAuction(auctionId, teamId);
  const body = req.body as UpdateTeamInput;
  const team = await prisma.team.update({
    where: { id: teamId },
    data: { name: body.name, shortName: body.shortName ? body.shortName : null },
    include: ownerSelect,
  });
  res.json(toTeam(team));
}

export async function deleteTeam(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  const teamId = req.params.teamId!;
  assertDraft(await auctionContext(auctionId));
  await teamInAuction(auctionId, teamId);
  await prisma.team.delete({ where: { id: teamId } });
  res.status(204).end();
}

export async function uploadTeamLogo(req: Request, res: Response): Promise<void> {
  const auctionId = req.params.id!;
  const teamId = req.params.teamId!;
  assertDraft(await auctionContext(auctionId));
  await teamInAuction(auctionId, teamId);
  if (!req.file) throw Errors.validation("No image uploaded");
  const team = await prisma.team.update({
    where: { id: teamId },
    data: { logoUrl: publicUrlFor(req.file.filename) },
    include: ownerSelect,
  });
  res.json(toTeam(team));
}
