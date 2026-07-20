import { Router } from "express";
import { AdminController } from "./admin.controller.js";
import {
  validateUpdateStoreStatus,
  validateUpdateUserStatus,
  validateUpdateSubscription,
} from "./admin.validation.js";
import {
  requireAuth,
  requireStoreAccess,
} from "../../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../../middleware/role.middleware.js";
import { validateObjectId } from "../../middleware/validation.middleware.js";

const router = Router();

function getController(): AdminController {
  return new AdminController();
}

router.get(
  "/dashboard",
  requireAuth(),
  requireStoreAccess(),
  requireSuperAdmin(),
  (req, res, next) => getController().getDashboard(req, res, next)
);

router.get(
  "/stores",
  requireAuth(),
  requireStoreAccess(),
  requireSuperAdmin(),
  (req, res, next) => getController().getStores(req, res, next)
);

router.get(
  "/stores/:id",
  requireAuth(),
  requireStoreAccess(),
  requireSuperAdmin(),
  validateObjectId("id"),
  (req, res, next) => getController().getStore(req, res, next)
);

router.patch(
  "/stores/:id/status",
  requireAuth(),
  requireStoreAccess(),
  requireSuperAdmin(),
  validateObjectId("id"),
  validateUpdateStoreStatus,
  (req, res, next) => getController().updateStoreStatus(req, res, next)
);

router.get(
  "/users",
  requireAuth(),
  requireStoreAccess(),
  requireSuperAdmin(),
  (req, res, next) => getController().getUsers(req, res, next)
);

router.patch(
  "/users/:id/status",
  requireAuth(),
  requireStoreAccess(),
  requireSuperAdmin(),
  validateObjectId("id"),
  validateUpdateUserStatus,
  (req, res, next) => getController().updateUserStatus(req, res, next)
);

router.get(
  "/subscriptions",
  requireAuth(),
  requireStoreAccess(),
  requireSuperAdmin(),
  (req, res, next) => getController().getSubscriptions(req, res, next)
);

router.patch(
  "/subscriptions/:id",
  requireAuth(),
  requireStoreAccess(),
  requireSuperAdmin(),
  validateObjectId("id"),
  validateUpdateSubscription,
  (req, res, next) => getController().updateSubscription(req, res, next)
);

router.get(
  "/system",
  requireAuth(),
  requireStoreAccess(),
  requireSuperAdmin(),
  (req, res, next) => getController().getSystemStats(req, res, next)
);

router.get(
  "/activity",
  requireAuth(),
  requireStoreAccess(),
  requireSuperAdmin(),
  (req, res, next) => getController().getActivityLogs(req, res, next)
);

export { router as adminRoutes };
