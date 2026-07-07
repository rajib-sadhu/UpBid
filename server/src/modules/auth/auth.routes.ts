import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginSchema, changePasswordSchema, updateProfileSchema } from "shared";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { authenticate } from "../../auth/middleware.js";
import * as ctrl from "./auth.controller.js";

const router = Router();

// Throttle credential-stuffing / brute-force against the login endpoint.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." },
});

router.post("/login", loginLimiter, validateBody(loginSchema), asyncHandler(ctrl.login));
router.get("/me", authenticate, asyncHandler(ctrl.me));
router.post(
  "/change-password",
  authenticate,
  validateBody(changePasswordSchema),
  asyncHandler(ctrl.changePassword),
);
router.get("/profile", authenticate, asyncHandler(ctrl.getProfile));
router.patch(
  "/profile",
  authenticate,
  validateBody(updateProfileSchema),
  asyncHandler(ctrl.updateProfile),
);

export default router;
