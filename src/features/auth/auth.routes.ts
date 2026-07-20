import { Router } from "express";
import { AuthController } from "./auth.controller";
import { getAuthService } from "./auth.service";
import { requireAuth, requireAccountApproved } from "../../middleware/auth.middleware";
import { createStoreValidation } from "./auth.validation";

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
  requireAccountApproved(),
  ...createStoreValidation,
  (req, res, next) => getController().createStore(req, res, next)
);

export { router as authRoutes };
