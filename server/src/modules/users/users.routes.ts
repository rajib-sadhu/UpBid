import { Router } from "express";
import { createOrganizerSchema, createFranchiseSchema } from "shared";
import { authenticate, requireRole, requireOwnership } from "../../auth/middleware.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { prisma } from "../../lib/prisma.js";
import * as ctrl from "./users.controller.js";

const router = Router();
router.use(authenticate);

router.post(
  "/organizers",
  requireRole("SUPER_ADMIN"),
  validateBody(createOrganizerSchema),
  asyncHandler(ctrl.createOrganizer),
);

router.post(
  "/franchises",
  requireRole("ORGANIZER", "SUPER_ADMIN"),
  validateBody(createFranchiseSchema),
  asyncHandler(ctrl.createFranchise),
);

router.get("/", requireRole("SUPER_ADMIN", "ORGANIZER"), asyncHandler(ctrl.listUsers));

// Self or the creating organizer may view; SUPER_ADMIN bypasses ownership.
router.get(
  "/:id",
  requireOwnership(async (req) => {
    const id = req.params.id;
    if (!id) return null;
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, createdById: true },
    });
    if (!target) return null;
    if (target.id === req.user!.id) return req.user!.id; // self-view
    return target.createdById;
  }),
  asyncHandler(ctrl.getUser),
);

export default router;
