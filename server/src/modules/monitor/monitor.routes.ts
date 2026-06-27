import { Router } from "express";
import { authenticate } from "../../auth/middleware.js";
import { asyncHandler } from "../../lib/async-handler.js";
import * as monitor from "./monitor.controller.js";

// Mounted at /api/monitor. Read-only dashboards & tracking (Phase 8). Access is
// resolved per-handler (auction monitor uses canViewAuction; my-teams is scoped
// to the caller), so there's no blanket ownership guard here.
const router = Router();
router.use(authenticate);

router.get("/auctions/:id", asyncHandler(monitor.getAuctionMonitor));
router.get("/my-teams", asyncHandler(monitor.getMyTeams));

export default router;
