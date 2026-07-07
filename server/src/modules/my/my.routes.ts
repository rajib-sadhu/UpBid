import { Router } from "express";
import { authenticate } from "../../auth/middleware.js";
import { asyncHandler } from "../../lib/async-handler.js";
import * as my from "./my.controller.js";

// Mounted at /api/my — the franchise owner's own competition browser. Every
// endpoint scopes to "leagues where I own a franchise" (organizer/admin pass).
const router = Router();
router.use(authenticate);

router.get("/leagues", asyncHandler(my.listMyLeagues));
router.get("/leagues/:leagueId/seasons", asyncHandler(my.listMyLeagueSeasons));
router.get("/seasons/:seasonId/auctions", asyncHandler(my.listMySeasonAuctions));

export default router;
