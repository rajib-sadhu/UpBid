import { Router } from "express";
import {
  updateAuctionSchema,
  auctionRulesSchema,
  lineupRulesSchema,
  incrementTiersSchema,
  allowedFormationsSchema,
  createTeamSchema,
  updateTeamSchema,
  addLotsSchema,
  updateLotSchema,
} from "shared";
import { authenticate, requireOwnership } from "../../auth/middleware.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { uploadImage } from "../../uploads/multer.js";
import { auctionOwnerId } from "./auctions.service.js";
import * as a from "./auctions.controller.js";
import * as teams from "./teams.controller.js";
import * as lots from "./lots.controller.js";

const router = Router();
router.use(authenticate);

// Caller's own auctions (any role) — must precede "/:id" so "mine" isn't an id.
router.get("/mine", asyncHandler(a.listMyAuctions));

// Every route here is keyed on the auction id; ownership = the league's organizer.
const own = requireOwnership((req) => auctionOwnerId(req.params.id ?? ""));

// Auction detail / update / delete
router.get("/:id", own, asyncHandler(a.getAuction));
router.patch("/:id", own, validateBody(updateAuctionSchema), asyncHandler(a.updateAuction));
router.delete("/:id", own, asyncHandler(a.deleteAuction));

// Configuration (DRAFT only — enforced in the controllers)
router.put("/:id/rules", own, validateBody(auctionRulesSchema), asyncHandler(a.putRules));
router.put(
  "/:id/lineup-rules",
  own,
  validateBody(lineupRulesSchema),
  asyncHandler(a.putLineupRules),
);
router.put(
  "/:id/increment-tiers",
  own,
  validateBody(incrementTiersSchema),
  asyncHandler(a.putIncrementTiers),
);
router.put(
  "/:id/formations",
  own,
  validateBody(allowedFormationsSchema),
  asyncHandler(a.putAllowedFormations),
);
router.post("/:id/go-live", own, asyncHandler(a.goLive));

// Teams
router.get("/:id/teams", own, asyncHandler(teams.listTeams));
router.post("/:id/teams", own, validateBody(createTeamSchema), asyncHandler(teams.createTeam));
router.patch(
  "/:id/teams/:teamId",
  own,
  validateBody(updateTeamSchema),
  asyncHandler(teams.updateTeam),
);
router.delete("/:id/teams/:teamId", own, asyncHandler(teams.deleteTeam));
router.post("/:id/teams/:teamId/logo", own, uploadImage, asyncHandler(teams.uploadTeamLogo));

// Lots
router.get("/:id/lots", own, asyncHandler(lots.listLots));
router.get("/:id/available-players", own, asyncHandler(lots.listAvailablePlayers));
router.post("/:id/lots", own, validateBody(addLotsSchema), asyncHandler(lots.addLots));
router.patch("/:id/lots/:lotId", own, validateBody(updateLotSchema), asyncHandler(lots.updateLot));
router.delete("/:id/lots/:lotId", own, asyncHandler(lots.deleteLot));

export default router;
