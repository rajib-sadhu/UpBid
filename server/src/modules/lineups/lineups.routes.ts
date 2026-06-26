import { Router } from "express";
import { saveLineupSchema } from "shared";
import { authenticate } from "../../auth/middleware.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import * as lineups from "./lineups.controller.js";

// Mounted at /api/teams. Per-team lineup: the franchise owner builds it, the
// organizer locks it. Ownership + edit policy are enforced in the controller
// (it needs the lineup's lock state, so it can't be a simple route guard).
const router = Router();
router.use(authenticate);

router.get("/:teamId/lineup", asyncHandler(lineups.getLineup));
router.put("/:teamId/lineup", validateBody(saveLineupSchema), asyncHandler(lineups.saveLineup));
router.post("/:teamId/lineup/lock", asyncHandler(lineups.lockLineup));
router.post("/:teamId/lineup/unlock", asyncHandler(lineups.unlockLineup));

export default router;
