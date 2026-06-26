import { Router } from "express";
import { authenticate, requireRole } from "../../auth/middleware.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { listFormations } from "./auctions.controller.js";

// Global football formation presets (read-only) for the allowed-formations picker.
const router = Router();
router.use(authenticate, requireRole("SUPER_ADMIN", "ORGANIZER"));
router.get("/", asyncHandler(listFormations));

export default router;
