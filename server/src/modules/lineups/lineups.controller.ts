import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import type { SaveLineupInput, LineupBuilderData, SaveLineupResponse } from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors, AppError } from "../../lib/errors.js";
import { validateLineup, type ValidatorContext } from "../../services/lineup-validator.js";
import { toFormation } from "../auctions/lots.mapper.js";
import { toSquadPlayer, toLineupDTO } from "./lineups.mapper.js";
import {
  loadTeamContext,
  effectiveRules,
  resolveAccess,
  buildValidatorContext,
  type SquadEntry,
  type MemberLike,
} from "./lineups.service.js";

// Squad rows joined with the data the validator + mappers need.
const squadInclude = {
  player: { select: { id: true, name: true, footballPosition: true } },
  auctionPlayer: { select: { isOverseas: true } },
} satisfies Prisma.TeamPlayerInclude;

const lineupInclude = {
  members: {
    include: { teamPlayer: { include: squadInclude } },
    orderBy: [{ membership: "asc" }, { battingOrder: "asc" }],
  },
} satisfies Prisma.LineupInclude;

type SquadRows = Awaited<ReturnType<typeof loadSquad>>;

function loadSquad(teamId: string) {
  return prisma.teamPlayer.findMany({ where: { teamId }, include: squadInclude });
}

function loadLineup(teamId: string) {
  return prisma.lineup.findUnique({ where: { teamId }, include: lineupInclude });
}

function squadMapFrom(rows: SquadRows): Map<string, SquadEntry> {
  return new Map(
    rows.map((tp) => [
      tp.id,
      { isOverseas: tp.auctionPlayer.isOverseas, footballPosition: tp.player.footballPosition },
    ]),
  );
}

function memberLikeFromRow(m: {
  teamPlayerId: string;
  membership: MemberLike["membership"];
  battingOrder: number | null;
  isWicketkeeper: boolean;
  isFirstBowler: boolean;
  isSecondBowler: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  assignedPosition: MemberLike["assignedPosition"];
}): MemberLike {
  return m;
}

function memberLikeFromInput(m: SaveLineupInput["members"][number]): MemberLike {
  return {
    teamPlayerId: m.teamPlayerId,
    membership: m.membership,
    // Batting order only applies to starters; null it out otherwise (as persisted).
    battingOrder: m.membership === "STARTER" ? (m.battingOrder ?? null) : null,
    isWicketkeeper: m.isWicketkeeper,
    isFirstBowler: m.isFirstBowler,
    isSecondBowler: m.isSecondBowler,
    isCaptain: m.isCaptain,
    isViceCaptain: m.isViceCaptain,
    assignedPosition: m.assignedPosition ?? null,
  };
}

/** Resolve the chosen formation row + whether it's permitted for the auction. */
async function formationInfo(
  formationId: string | null,
  allowedIds: string[],
): Promise<{ formation: ValidatorContext["formation"]; allowed: boolean }> {
  if (!formationId) return { formation: null, allowed: true };
  const f = await prisma.formation.findUnique({ where: { id: formationId } });
  if (!f) throw Errors.validation("Unknown formation selected");
  return {
    formation: { numGK: f.numGK, numDef: f.numDef, numMid: f.numMid, numFwd: f.numFwd },
    allowed: allowedIds.includes(formationId),
  };
}

// GET /api/teams/:teamId/lineup — everything the builder needs.
export async function getLineup(req: Request, res: Response): Promise<void> {
  const teamId = req.params.teamId!;
  const user = req.user!;
  const ctx = await loadTeamContext(teamId);

  const [rulesRow, allowed, squadRows, lineup] = await Promise.all([
    prisma.lineupRules.findUnique({ where: { auctionId: ctx.auctionId } }),
    prisma.auctionAllowedFormation.findMany({
      where: { auctionId: ctx.auctionId },
      include: { formation: true },
    }),
    loadSquad(teamId),
    loadLineup(teamId),
  ]);

  const rules = effectiveRules(rulesRow);
  const access = resolveAccess(
    ctx,
    lineup?.status ?? "DRAFT",
    rules.editableAfterLockByOwner,
    user,
  );
  if (!access.canView) throw Errors.forbidden();

  const allowedIds = allowed.map((a) => a.formationId);
  const fInfo = await formationInfo(lineup?.formationId ?? null, allowedIds);
  const squadMap = squadMapFrom(squadRows);

  const violations = validateLineup(
    buildValidatorContext({
      sport: ctx.sport,
      rules,
      formation: fInfo.formation,
      formationAllowed: fInfo.allowed,
      members: (lineup?.members ?? []).map(memberLikeFromRow),
      squad: squadMap,
    }),
  );

  const data: LineupBuilderData = {
    sport: ctx.sport,
    auctionStatus: ctx.auctionStatus,
    canEdit: access.canEdit && ctx.auctionStatus === "COMPLETED",
    canLock: access.canLock,
    rules: { ...rules },
    allowedFormations: allowed.map((a) => toFormation(a.formation)),
    squad: squadRows.map(toSquadPlayer),
    lineup: toLineupDTO(ctx.teamId, ctx.teamName, lineup),
    violations,
  };
  res.json(data);
}

// PUT /api/teams/:teamId/lineup — save the draft + return live violations.
export async function saveLineup(req: Request, res: Response): Promise<void> {
  const teamId = req.params.teamId!;
  const user = req.user!;
  const body = req.body as SaveLineupInput;
  const ctx = await loadTeamContext(teamId);
  if (ctx.auctionStatus !== "COMPLETED") {
    throw Errors.invalidState("Lineups can be built only after the auction is completed");
  }

  const [rulesRow, allowed, squadRows, existing] = await Promise.all([
    prisma.lineupRules.findUnique({ where: { auctionId: ctx.auctionId } }),
    prisma.auctionAllowedFormation.findMany({ where: { auctionId: ctx.auctionId } }),
    loadSquad(teamId),
    loadLineup(teamId),
  ]);

  const rules = effectiveRules(rulesRow);
  const access = resolveAccess(
    ctx,
    existing?.status ?? "DRAFT",
    rules.editableAfterLockByOwner,
    user,
  );
  if (!access.canView) throw Errors.forbidden();
  if (!access.canEdit) {
    throw new AppError("LOCKED_NOT_EDITABLE", "This lineup is locked and cannot be edited", 409);
  }

  // Integrity: every referenced player must be in this team's squad; no dupes.
  const squadMap = squadMapFrom(squadRows);
  const seen = new Set<string>();
  for (const m of body.members) {
    if (!squadMap.has(m.teamPlayerId)) {
      throw Errors.validation("A selected player is not in this team's squad");
    }
    if (seen.has(m.teamPlayerId)) throw Errors.validation("A player appears twice in the lineup");
    seen.add(m.teamPlayerId);
  }

  const formationId = ctx.sport === "FOOTBALL" ? (body.formationId ?? null) : null;
  const allowedIds = allowed.map((a) => a.formationId);
  const fInfo = await formationInfo(formationId, allowedIds);

  try {
    await prisma.$transaction(async (tx) => {
      const lineup = await tx.lineup.upsert({
        where: { teamId },
        create: { teamId, formationId, status: "DRAFT" },
        update: { formationId },
      });
      await tx.lineupMember.deleteMany({ where: { lineupId: lineup.id } });
      if (body.members.length) {
        await tx.lineupMember.createMany({
          data: body.members.map((m) => ({
            lineupId: lineup.id,
            teamPlayerId: m.teamPlayerId,
            membership: m.membership,
            battingOrder: m.membership === "STARTER" ? (m.battingOrder ?? null) : null,
            isWicketkeeper: m.isWicketkeeper,
            isFirstBowler: m.isFirstBowler,
            isSecondBowler: m.isSecondBowler,
            isCaptain: m.isCaptain,
            isViceCaptain: m.isViceCaptain,
            assignedPosition: m.assignedPosition ?? null,
          })),
        });
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw Errors.validation("Two starters cannot share a batting order");
    }
    throw e;
  }

  const violations = validateLineup(
    buildValidatorContext({
      sport: ctx.sport,
      rules,
      formation: fInfo.formation,
      formationAllowed: fInfo.allowed,
      members: body.members.map(memberLikeFromInput),
      squad: squadMap,
    }),
  );

  const lineup = await loadLineup(teamId);
  const response: SaveLineupResponse = {
    lineup: toLineupDTO(ctx.teamId, ctx.teamName, lineup),
    violations,
  };
  res.json(response);
}

// POST /api/teams/:teamId/lineup/lock — organizer locks a zero-violation lineup.
export async function lockLineup(req: Request, res: Response): Promise<void> {
  const teamId = req.params.teamId!;
  const user = req.user!;
  const ctx = await loadTeamContext(teamId);

  const [rulesRow, allowed, squadRows, existing] = await Promise.all([
    prisma.lineupRules.findUnique({ where: { auctionId: ctx.auctionId } }),
    prisma.auctionAllowedFormation.findMany({ where: { auctionId: ctx.auctionId } }),
    loadSquad(teamId),
    loadLineup(teamId),
  ]);

  const rules = effectiveRules(rulesRow);
  const access = resolveAccess(
    ctx,
    existing?.status ?? "DRAFT",
    rules.editableAfterLockByOwner,
    user,
  );
  if (!access.canLock) throw Errors.forbidden("Only the organizer can lock a lineup");
  if (!existing) throw Errors.invalidState("Build the lineup before locking");

  const allowedIds = allowed.map((a) => a.formationId);
  const fInfo = await formationInfo(existing.formationId ?? null, allowedIds);
  const squadMap = squadMapFrom(squadRows);
  const violations = validateLineup(
    buildValidatorContext({
      sport: ctx.sport,
      rules,
      formation: fInfo.formation,
      formationAllowed: fInfo.allowed,
      members: existing.members.map(memberLikeFromRow),
      squad: squadMap,
    }),
  );
  if (violations.length) {
    throw new AppError(
      "INVALID_STATE",
      "Lineup has validation errors and cannot be locked",
      409,
      violations,
    );
  }

  await prisma.lineup.update({
    where: { teamId },
    data: { status: "LOCKED", lockedById: user.id, lockedAt: new Date() },
  });
  res.json(toLineupDTO(ctx.teamId, ctx.teamName, await loadLineup(teamId)));
}

// POST /api/teams/:teamId/lineup/unlock — organizer reverts to DRAFT for editing.
export async function unlockLineup(req: Request, res: Response): Promise<void> {
  const teamId = req.params.teamId!;
  const user = req.user!;
  const ctx = await loadTeamContext(teamId);
  const existing = await loadLineup(teamId);
  const rulesRow = await prisma.lineupRules.findUnique({ where: { auctionId: ctx.auctionId } });
  const rules = effectiveRules(rulesRow);
  const access = resolveAccess(
    ctx,
    existing?.status ?? "DRAFT",
    rules.editableAfterLockByOwner,
    user,
  );
  if (!access.canLock) throw Errors.forbidden("Only the organizer can unlock a lineup");
  if (!existing) throw Errors.notFound("No lineup to unlock");

  await prisma.lineup.update({
    where: { teamId },
    data: { status: "DRAFT", lockedById: null, lockedAt: null },
  });
  res.json(toLineupDTO(ctx.teamId, ctx.teamName, await loadLineup(teamId)));
}
