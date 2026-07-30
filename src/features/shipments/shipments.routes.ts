import { Router } from "express";
import { ShipmentController } from "./shipments.controller.js";
import {
  requireAuth,
  requireStoreAccess,
  requireStoreApproved,
  requirePermission,
} from "../../middleware/auth.middleware.js";
import { validateObjectId } from "../../middleware/validation.middleware.js";
import { validateCreateShipment, validateUpdateShipment } from "./shipments.validation.js";

const router = Router();

function getController(): ShipmentController {
  return new ShipmentController();
}

router.get(
  "/sale/:saleId",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("sales"),
  (req, res, next) => getController().getBySaleId(req, res, next)
);

router.get(
  "/",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("sales"),
  (req, res, next) => getController().list(req, res, next)
);

router.get(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("sales"),
  validateObjectId("id"),
  (req, res, next) => getController().getById(req, res, next)
);

router.post(
  "/",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("sales"),
  validateCreateShipment,
  (req, res, next) => getController().create(req, res, next)
);

router.patch(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("sales"),
  validateObjectId("id"),
  validateUpdateShipment,
  (req, res, next) => getController().update(req, res, next)
);

router.delete(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("sales"),
  validateObjectId("id"),
  (req, res, next) => getController().remove(req, res, next)
);

export { router as shipmentRoutes };
