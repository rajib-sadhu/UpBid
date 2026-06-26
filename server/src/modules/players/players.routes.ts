import { Router } from "express";
import { createPlayerSchema, updatePlayerSchema } from "shared";
import { authenticate, requireRole } from "../../auth/middleware.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { uploadImage } from "../../uploads/multer.js";
import * as ctrl from "./players.controller.js";

// Players are a GLOBAL pool managed by organizers + super admin (no per-owner gate).
const router = Router();
router.use(authenticate, requireRole("SUPER_ADMIN", "ORGANIZER"));

router.get("/", asyncHandler(ctrl.listPlayers));
router.post("/", validateBody(createPlayerSchema), asyncHandler(ctrl.createPlayer));
router.get("/:id", asyncHandler(ctrl.getPlayer));
router.patch("/:id", validateBody(updatePlayerSchema), asyncHandler(ctrl.updatePlayer));
router.delete("/:id", asyncHandler(ctrl.deletePlayer));
router.post("/:id/photo", uploadImage, asyncHandler(ctrl.uploadPlayerPhoto));

export default router;
