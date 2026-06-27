import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import type {
  AuctionMonitor,
  MonitorTeam,
  MonitorProgress,
  MyTeamSummary,
  LotStatus,
} from "shared";
import { CRICKET_ROLE_LABELS } from "shared";
import { prisma } from "../../lib/prisma.js";
import { Errors } from "../../lib/errors.js";
import { money, moneyToWire } from "../../lib/money.js";
import { canViewAuction, auctionOwnerId } from "../../realtime/authz.js";
import { summarizeTeam } from "./monitor.service.js";

// Default reserve figures if an auction somehow lacks a rules row (shouldn't
// happen post go-live, but the monitor must never 500 on a half-configured draft).
const FALLBACK = { credit: "0", min: 0, max: 0, unsold: "0" };

const teamInclude = {
  franchise: { include: { owner: { select: { name: true, email: true } } } },
  lineup: { select: { status: true } },
  players: {
    include: {
      player: {
        select: {
          id: true,
          name: true,
          photoUrl: true,
          role: true,
          footballPosition: true,
          cricketRole: true,
        },
      },
      auctionPlayer: { select: { isOverseas: true } },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.TeamInclude;

// GET /api/monitor/auctions/:id — full read model for the organizer monitor,
// super-admin inspection, and a franchise viewing an auction it plays in.
export async function getAuctionMonitor(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw Errors.notFound();
  const user = req.user!;
  if (!(await canViewAuction(user, id))) throw Errors.forbidden();

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      rules: true,
      season: { select: { name: true, league: { select: { name: true, sport: true } } } },
      teams: { include: teamInclude, orderBy: { createdAt: "asc" } },
    },
  });
  if (!auction) throw Errors.notFound();

  // Lot progress: count by status in one grouped query.
  const grouped = await prisma.auctionPlayer.groupBy({
    by: ["status"],
    where: { auctionId: id },
    _count: { _all: true },
  });
  const progress: MonitorProgress = {
    PENDING: 0,
    ON_BLOCK: 0,
    SOLD: 0,
    UNSOLD: 0,
    ASSIGNED: 0,
    total: 0,
  };
  for (const g of grouped) {
    progress[g.status as LotStatus] = g._count._all;
    progress.total += g._count._all;
  }

  const r = auction.rules;
  const creditPerTeam = money(r?.creditPerTeam ?? FALLBACK.credit);
  const unsoldPrice = money(r?.unsoldPrice ?? FALLBACK.unsold);
  const minPlayers = r?.minPlayersPerTeam ?? FALLBACK.min;
  const maxPlayers = r?.maxPlayersPerTeam ?? FALLBACK.max;

  const teams: MonitorTeam[] = auction.teams.map((t) => {
    const summary = summarizeTeam({
      creditPerTeam,
      committedAmount: money(t.committedAmount),
      unsoldPrice,
      minPlayersPerTeam: minPlayers,
      maxPlayersPerTeam: maxPlayers,
      playerCount: t.playerCount,
    });
    return {
      id: t.id,
      name: t.franchise.name,
      shortName: t.franchise.shortName,
      primaryColor: t.franchise.primaryColor,
      secondaryColor: t.franchise.secondaryColor,
      logoUrl: t.franchise.logoUrl,
      ownerUserId: t.franchise.ownerUserId,
      ownerName: t.franchise.owner?.name ?? null,
      ownerEmail: t.franchise.owner?.email ?? null,
      committedAmount: moneyToWire(money(t.committedAmount)),
      remainingCredit: summary.remainingCredit,
      maxBid: summary.maxBid,
      playerCount: t.playerCount,
      slotsRemaining: summary.slotsRemaining,
      belowMinimum: summary.belowMinimum,
      lineupStatus: t.lineup?.status ?? "NONE",
      squad: t.players.map((tp) => ({
        teamPlayerId: tp.id,
        playerId: tp.playerId,
        playerName: tp.player.name,
        photoUrl: tp.player.photoUrl,
        // Cricket players carry a structured role; fall back to its label.
        role: tp.player.role ?? (tp.player.cricketRole ? CRICKET_ROLE_LABELS[tp.player.cricketRole] : null),
        footballPosition: tp.player.footballPosition,
        isOverseas: tp.auctionPlayer.isOverseas,
        price: moneyToWire(money(tp.price)),
        acquiredVia: tp.acquiredVia,
      })),
    };
  });

  const canManage =
    user.role === "SUPER_ADMIN" ||
    (user.role === "ORGANIZER" && (await auctionOwnerId(id)) === user.id);

  const data: AuctionMonitor = {
    auctionId: auction.id,
    name: auction.name,
    sport: auction.season.league.sport,
    status: auction.status,
    round: auction.round,
    biddingMode: auction.biddingMode,
    leagueName: auction.season.league.name,
    seasonName: auction.season.name,
    rules: r
      ? {
          creditPerTeam: moneyToWire(creditPerTeam),
          minPlayersPerTeam: minPlayers,
          maxPlayersPerTeam: maxPlayers,
          unsoldPrice: moneyToWire(unsoldPrice),
        }
      : null,
    progress,
    teams,
    canManage,
  };
  res.json(data);
}

// GET /api/monitor/my-teams — every team the caller owns, across all auctions,
// with budget + lineup status. The franchise's home view.
export async function getMyTeams(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const teams = await prisma.team.findMany({
    where: { franchise: { ownerUserId: user.id } },
    include: {
      franchise: {
        select: {
          name: true,
          shortName: true,
          primaryColor: true,
          secondaryColor: true,
          logoUrl: true,
        },
      },
      lineup: { select: { status: true } },
      auction: {
        select: {
          id: true,
          name: true,
          status: true,
          rules: { select: { creditPerTeam: true, minPlayersPerTeam: true } },
          season: { select: { league: { select: { sport: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const data: MyTeamSummary[] = teams.map((t) => {
    const creditPerTeam = money(t.auction.rules?.creditPerTeam ?? FALLBACK.credit);
    const minPlayers = t.auction.rules?.minPlayersPerTeam ?? FALLBACK.min;
    return {
      teamId: t.id,
      teamName: t.franchise.name,
      shortName: t.franchise.shortName,
      primaryColor: t.franchise.primaryColor,
      secondaryColor: t.franchise.secondaryColor,
      logoUrl: t.franchise.logoUrl,
      auctionId: t.auction.id,
      auctionName: t.auction.name,
      auctionStatus: t.auction.status,
      sport: t.auction.season.league.sport,
      committedAmount: moneyToWire(money(t.committedAmount)),
      remainingCredit: moneyToWire(money(creditPerTeam).sub(money(t.committedAmount))),
      playerCount: t.playerCount,
      belowMinimum: t.playerCount < minPlayers,
      lineupStatus: t.lineup?.status ?? "NONE",
    };
  });
  res.json(data);
}
