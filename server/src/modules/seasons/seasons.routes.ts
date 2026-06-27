import { Router } from "express";
import { updateSeasonSchema, createAuctionSchema, setSeasonFranchisesSchema } from "shared";
import { authenticate, requireOwnership } from "../../auth/middleware.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { seasonOwnerId } from "./seasons.service.js";
import * as ctrl from "./seasons.controller.js";
import * as auctions from "../auctions/auctions.controller.js";

const router = Router();
router.use(authenticate);

const ownSeason = requireOwnership((req) => seasonOwnerId(req.params.id ?? ""));
const ownSeasonNested = requireOwnership((req) => seasonOwnerId(req.params.seasonId ?? ""));

router.get("/:id", ownSeason, asyncHandler(ctrl.getSeason));
router.patch("/:id", ownSeason, validateBody(updateSeasonSchema), asyncHandler(ctrl.updateSeason));
router.delete("/:id", ownSeason, asyncHandler(ctrl.deleteSeason));

// Participating franchises (which league teams play this season)
router.get("/:id/franchises", ownSeason, asyncHandler(ctrl.getSeasonFranchises));
router.put(
  "/:id/franchises",
  ownSeason,
  validateBody(setSeasonFranchisesSchema),
  asyncHandler(ctrl.setSeasonFranchises),
);

// Auctions nested under a season
router.get("/:seasonId/auctions", ownSeasonNested, asyncHandler(auctions.listAuctions));
router.post(
  "/:seasonId/auctions",
  ownSeasonNested,
  validateBody(createAuctionSchema),
  asyncHandler(auctions.createAuction),
);

export default router;
