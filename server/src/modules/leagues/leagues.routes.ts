import { Router } from "express";
import {
  createLeagueSchema,
  updateLeagueSchema,
  createSeasonSchema,
  banPlayerSchema,
  createFranchiseSchema,
  updateFranchiseSchema,
} from "shared";
import { authenticate, requireRole, requireOwnership } from "../../auth/middleware.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { uploadImage } from "../../uploads/multer.js";
import { leagueOwnerId } from "./leagues.service.js";
import * as leagues from "./leagues.controller.js";
import * as seasons from "../seasons/seasons.controller.js";
import * as players from "../players/players.controller.js";
import * as franchises from "../franchises/franchises.controller.js";

const router = Router();
router.use(authenticate);

// Ownership gate keyed on whichever route param holds the league id.
const ownLeague = (param: "id" | "leagueId") =>
  requireOwnership((req) => leagueOwnerId(req.params[param] ?? ""));

const manager = requireRole("SUPER_ADMIN", "ORGANIZER");

// League CRUD
router.post("/", manager, validateBody(createLeagueSchema), asyncHandler(leagues.createLeague));
router.get("/", manager, asyncHandler(leagues.listLeagues));
router.get("/:id", ownLeague("id"), asyncHandler(leagues.getLeague));
router.patch("/:id", ownLeague("id"), validateBody(updateLeagueSchema), asyncHandler(leagues.updateLeague));
router.delete("/:id", ownLeague("id"), asyncHandler(leagues.deleteLeague));

// Seasons nested under a league
router.get("/:leagueId/seasons", ownLeague("leagueId"), asyncHandler(seasons.listSeasons));
router.post(
  "/:leagueId/seasons",
  ownLeague("leagueId"),
  validateBody(createSeasonSchema),
  asyncHandler(seasons.createSeason),
);

// Franchises (league-level team identities) nested under a league
router.get(
  "/:leagueId/franchises",
  ownLeague("leagueId"),
  asyncHandler(franchises.listFranchises),
);
router.post(
  "/:leagueId/franchises",
  ownLeague("leagueId"),
  validateBody(createFranchiseSchema),
  asyncHandler(franchises.createFranchise),
);
router.patch(
  "/:leagueId/franchises/:franchiseId",
  ownLeague("leagueId"),
  validateBody(updateFranchiseSchema),
  asyncHandler(franchises.updateFranchise),
);
router.delete(
  "/:leagueId/franchises/:franchiseId",
  ownLeague("leagueId"),
  asyncHandler(franchises.deleteFranchise),
);
router.post(
  "/:leagueId/franchises/:franchiseId/logo",
  ownLeague("leagueId"),
  uploadImage,
  asyncHandler(franchises.uploadFranchiseLogo),
);

// Per-league player ban status
router.get("/:leagueId/players", ownLeague("leagueId"), asyncHandler(players.listLeaguePlayers));
router.put(
  "/:leagueId/players/:playerId/ban",
  ownLeague("leagueId"),
  validateBody(banPlayerSchema),
  asyncHandler(players.setPlayerBan),
);

export default router;
