import { Router } from "express";
import { DashboardController } from "./dashboard.controller.js";
import {
  requireAuth,
  requireStoreAccess,
  requireStoreApproved,
} from "../../middleware/auth.middleware.js";

const router = Router();

function getController(): DashboardController {
  return new DashboardController();
}

router.get(
  "/summary",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  (req, res, next) => getController().getSummary(req, res, next)
);

router.get(
  "/activities",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  (req, res, next) => getController().getActivities(req, res, next)
);

export { router as dashboardRoutes };
