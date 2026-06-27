import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import type { CreateFranchiseInput, UpdateFranchiseInput } from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { publicUrlFor } from "../../uploads/multer.js";
import { toFranchise } from "./franchises.mapper.js";

const ownerSelect = { owner: { select: { name: true, email: true } } };

// Franchise has two unique constraints per league: short name, and owner.
function rethrowFranchiseConflict(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    const target = String(e.meta?.target ?? "");
    if (target.includes("ownerUserId")) {
      throw Errors.conflict("That franchise owner already has a franchise in this league");
    }
    throw Errors.conflict("Another franchise in this league already uses that short name");
  }
  throw e;
}

/** Validate the optional owner: must exist and be a FRANCHISE user. "" → null. */
async function resolveOwner(ownerUserId: string | undefined): Promise<string | null> {
  if (!ownerUserId) return null;
  const owner = await prisma.user.findUnique({ where: { id: ownerUserId } });
  if (!owner) throw Errors.validation("Selected owner does not exist");
  if (owner.role !== "FRANCHISE") throw Errors.validation("Owner must be a franchise user");
  return owner.id;
}

async function franchiseInLeague(leagueId: string, franchiseId: string) {
  const f = await prisma.franchise.findUnique({ where: { id: franchiseId } });
  if (!f || f.leagueId !== leagueId) throw Errors.notFound("Franchise not found");
  return f;
}

// GET /api/leagues/:leagueId/franchises
export async function listFranchises(req: Request, res: Response): Promise<void> {
  const leagueId = req.params.leagueId!;
  const franchises = await prisma.franchise.findMany({
    where: { leagueId },
    orderBy: { createdAt: "asc" },
    include: ownerSelect,
  });
  res.json(franchises.map(toFranchise));
}

// POST /api/leagues/:leagueId/franchises
export async function createFranchise(req: Request, res: Response): Promise<void> {
  const leagueId = req.params.leagueId!;
  const body = req.body as CreateFranchiseInput;
  const ownerUserId = await resolveOwner(body.ownerUserId || undefined);
  try {
    const franchise = await prisma.franchise.create({
      data: {
        leagueId,
        name: body.name,
        shortName: body.shortName,
        primaryColor: body.primaryColor,
        secondaryColor: body.secondaryColor || null,
        ownerUserId,
      },
      include: ownerSelect,
    });
    res.status(201).json(toFranchise(franchise));
  } catch (e) {
    rethrowFranchiseConflict(e);
  }
}

// PATCH /api/leagues/:leagueId/franchises/:franchiseId
export async function updateFranchise(req: Request, res: Response): Promise<void> {
  const leagueId = req.params.leagueId!;
  const franchiseId = req.params.franchiseId!;
  await franchiseInLeague(leagueId, franchiseId);
  const body = req.body as UpdateFranchiseInput;
  const ownerUserId = await resolveOwner(body.ownerUserId || undefined);
  try {
    const franchise = await prisma.franchise.update({
      where: { id: franchiseId },
      data: {
        name: body.name,
        shortName: body.shortName,
        primaryColor: body.primaryColor,
        secondaryColor: body.secondaryColor || null,
        ownerUserId,
      },
      include: ownerSelect,
    });
    res.json(toFranchise(franchise));
  } catch (e) {
    rethrowFranchiseConflict(e);
  }
}

// DELETE /api/leagues/:leagueId/franchises/:franchiseId
export async function deleteFranchise(req: Request, res: Response): Promise<void> {
  const leagueId = req.params.leagueId!;
  const franchiseId = req.params.franchiseId!;
  await franchiseInLeague(leagueId, franchiseId);
  try {
    await prisma.franchise.delete({ where: { id: franchiseId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      throw Errors.conflict("Remove this franchise from its seasons/auctions first");
    }
    throw e;
  }
  res.status(204).end();
}

// POST /api/leagues/:leagueId/franchises/:franchiseId/logo
export async function uploadFranchiseLogo(req: Request, res: Response): Promise<void> {
  const leagueId = req.params.leagueId!;
  const franchiseId = req.params.franchiseId!;
  await franchiseInLeague(leagueId, franchiseId);
  if (!req.file) throw Errors.validation("No image uploaded");
  const franchise = await prisma.franchise.update({
    where: { id: franchiseId },
    data: { logoUrl: publicUrlFor(req.file.filename) },
    include: ownerSelect,
  });
  res.json(toFranchise(franchise));
}
