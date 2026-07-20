import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { getAuthService } from "./auth.service.js";
import { requireAuth, requireAccountApproved } from "../../middleware/auth.middleware.js";
import { createStoreValidation } from "./auth.validation.js";

const router = Router();

function getController(): AuthController {
  return new AuthController(getAuthService());
}

router.get("/session", (req, res, next) => getController().getSession(req, res, next));

router.get(
  "/profile",
  requireAuth(),
  requireAccountApproved(),
  (req, res, next) => getController().getProfile(req, res, next)
);

router.post(
  "/store",
  requireAuth(),
  ...createStoreValidation,
  (req, res, next) => getController().createStore(req, res, next)
);

export { router as authRoutes };
