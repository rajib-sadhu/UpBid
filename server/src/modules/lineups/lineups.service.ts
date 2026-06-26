import type { LineupRules, LineupStatus } from "@prisma/client";
import type { Sport, AuctionStatus } from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import type { AuthUser } from "../../auth/types.js";
import type {
  ValidatorContext,
  ValidatorMember,
  ValidatorRules,
} from "../../services/lineup-validator.js";

export interface TeamContext {
  teamId: string;
  teamName: string;
  ownerUserId: string;
  auctionId: string;
  auctionStatus: AuctionStatus;
  sport: Sport;
  organizerId: string;
}

/** Load the team + its auction/sport/owner/organizer (throws NOT_FOUND). */
export async function loadTeamContext(teamId: string): Promise<TeamContext> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      ownerUserId: true,
      auctionId: true,
      auction: {
        select: {
          status: true,
          season: { select: { league: { select: { sport: true, organizerId: true } } } },
        },
      },
    },
  });
  if (!team) throw Errors.notFound("Team not found");
  return {
    teamId: team.id,
    teamName: team.name,
    ownerUserId: team.ownerUserId,
    auctionId: team.auctionId,
    auctionStatus: team.auction.status,
    sport: team.auction.season.league.sport,
    organizerId: team.auction.season.league.organizerId,
  };
}

export interface EffectiveRules {
  startingSize: number;
  overseasCapEnabled: boolean;
  maxOverseasInXI: number | null;
  requireWicketkeeper: boolean;
  requireCaptain: boolean;
  requireViceCaptain: boolean;
  requireFirstBowler: boolean;
  requireSecondBowler: boolean;
  requireFullBattingOrder: boolean;
  benchSize: number | null;
  editableAfterLockByOwner: boolean;
}

/** Schema-matching defaults used when the organizer hasn't set LineupRules yet. */
export const DEFAULT_RULES: EffectiveRules = {
  startingSize: 11,
  overseasCapEnabled: false,
  maxOverseasInXI: null,
  requireWicketkeeper: true,
  requireCaptain: true,
  requireViceCaptain: true,
  requireFirstBowler: true,
  requireSecondBowler: true,
  requireFullBattingOrder: true,
  benchSize: null,
  editableAfterLockByOwner: false,
};

export function effectiveRules(rules: LineupRules | null): EffectiveRules {
  if (!rules) return { ...DEFAULT_RULES };
  return {
    startingSize: rules.startingSize,
    overseasCapEnabled: rules.overseasCapEnabled,
    maxOverseasInXI: rules.maxOverseasInXI,
    requireWicketkeeper: rules.requireWicketkeeper,
    requireCaptain: rules.requireCaptain,
    requireViceCaptain: rules.requireViceCaptain,
    requireFirstBowler: rules.requireFirstBowler,
    requireSecondBowler: rules.requireSecondBowler,
    requireFullBattingOrder: rules.requireFullBattingOrder,
    benchSize: rules.benchSize,
    editableAfterLockByOwner: rules.editableAfterLockByOwner,
  };
}

export interface Access {
  canView: boolean;
  canEdit: boolean;
  canLock: boolean;
  isOrganizer: boolean;
  isOwner: boolean;
}

export function resolveAccess(
  ctx: TeamContext,
  lineupStatus: LineupStatus,
  editableAfterLockByOwner: boolean,
  user: AuthUser,
): Access {
  const isOrganizer =
    user.role === "SUPER_ADMIN" || (user.role === "ORGANIZER" && user.id === ctx.organizerId);
  const isOwner = user.role === "FRANCHISE" && user.id === ctx.ownerUserId;
  const ownerCanEdit = lineupStatus !== "LOCKED" || editableAfterLockByOwner;
  return {
    canView: isOrganizer || isOwner,
    canEdit: isOrganizer || (isOwner && ownerCanEdit),
    canLock: isOrganizer,
    isOrganizer,
    isOwner,
  };
}

/** Squad info needed to enrich members for the validator. */
export interface SquadEntry {
  isOverseas: boolean;
  footballPosition: ValidatorMember["footballPosition"];
}

/** Common shape shared by saved members and the save payload. */
export interface MemberLike {
  teamPlayerId: string;
  membership: ValidatorMember["membership"];
  battingOrder?: number | null;
  isWicketkeeper: boolean;
  isFirstBowler: boolean;
  isSecondBowler: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  assignedPosition?: ValidatorMember["assignedPosition"];
}

export function buildValidatorContext(args: {
  sport: Sport;
  rules: ValidatorRules;
  formation: ValidatorContext["formation"];
  formationAllowed: boolean;
  members: MemberLike[];
  squad: Map<string, SquadEntry>;
}): ValidatorContext {
  return {
    sport: args.sport,
    rules: args.rules,
    formation: args.formation,
    formationAllowed: args.formationAllowed,
    members: args.members.map((m) => {
      const sq = args.squad.get(m.teamPlayerId);
      return {
        teamPlayerId: m.teamPlayerId,
        inSquad: sq !== undefined,
        membership: m.membership,
        battingOrder: m.battingOrder ?? null,
        isWicketkeeper: m.isWicketkeeper,
        isFirstBowler: m.isFirstBowler,
        isSecondBowler: m.isSecondBowler,
        isCaptain: m.isCaptain,
        isViceCaptain: m.isViceCaptain,
        assignedPosition: m.assignedPosition ?? null,
        isOverseas: sq?.isOverseas ?? false,
        footballPosition: sq?.footballPosition ?? null,
      };
    }),
  };
}
