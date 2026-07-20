import { Router } from "express";
import { BundleController } from "./bundles.controller";
import {
  requireAuth,
  requireStoreAccess,
  requireStoreApproved,
  requirePermission,
} from "../../middleware/auth.middleware";
import { validateObjectId } from "../../middleware/validation.middleware";
import { validateBundleInput } from "./bundles.validation";

const router = Router();

function getController(): BundleController {
  return new BundleController();
}

router.get(
  "/",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("bundles"),
  (req, res, next) => getController().list(req, res, next)
);

router.get(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("bundles"),
  validateObjectId("id"),
  (req, res, next) => getController().getById(req, res, next)
);

router.get(
  "/:id/stock",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("bundles"),
  validateObjectId("id"),
  (req, res, next) => getController().stock(req, res, next)
);

router.post(
  "/",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("bundles"),
  validateBundleInput,
  (req, res, next) => getController().create(req, res, next)
);

router.patch(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("bundles"),
  validateObjectId("id"),
  validateBundleInput,
  (req, res, next) => getController().update(req, res, next)
);

router.delete(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("bundles"),
  validateObjectId("id"),
  (req, res, next) => getController().remove(req, res, next)
);

export { router as bundleRoutes };
