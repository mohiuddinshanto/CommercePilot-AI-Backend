import { Router } from "express";
import { SubscriptionController } from "./subscription.controller";
import { validateCreateSubscription, validateUpgradePlan } from "./subscription.validation";
import {
  requireAuth,
  requireStoreAccess,
  requireStoreApproved,
  requirePermission,
} from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

const router = Router();

function getController(): SubscriptionController {
  return new SubscriptionController();
}

router.get(
  "/",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("settings"),
  (req, res, next) => getController().getSubscription(req, res, next)
);

router.post(
  "/",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requireRole("owner"),
  validateCreateSubscription,
  (req, res, next) => getController().createSubscription(req, res, next)
);

router.patch(
  "/upgrade",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requireRole("owner"),
  validateUpgradePlan,
  (req, res, next) => getController().upgradePlan(req, res, next)
);

router.patch(
  "/downgrade",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requireRole("owner"),
  validateUpgradePlan,
  (req, res, next) => getController().downgradePlan(req, res, next)
);

router.patch(
  "/cancel",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requireRole("owner"),
  (req, res, next) => getController().cancelSubscription(req, res, next)
);

router.patch(
  "/renew",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requireRole("owner"),
  (req, res, next) => getController().renewSubscription(req, res, next)
);

router.get(
  "/usage",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("settings"),
  (req, res, next) => getController().getUsage(req, res, next)
);

router.get(
  "/billing",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("settings"),
  (req, res, next) => getController().getBillingHistory(req, res, next)
);

export { router as subscriptionRoutes };
