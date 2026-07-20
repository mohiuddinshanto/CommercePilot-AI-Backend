import { Router } from "express";
import { InventoryController } from "./inventory.controller";
import {
  requireAuth,
  requireStoreAccess,
  requireStoreApproved,
  requirePermission,
} from "../../middleware/auth.middleware";
import { validateObjectId } from "../../middleware/validation.middleware";
import {
  validateInventoryInput,
  validateStockMovementInput,
} from "./inventory.validation";

const router = Router();

function getController(): InventoryController {
  return new InventoryController();
}

router.get(
  "/low-stock",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inventory"),
  (req, res, next) => getController().lowStock(req, res, next)
);

router.get(
  "/out-of-stock",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inventory"),
  (req, res, next) => getController().outOfStock(req, res, next)
);

router.get(
  "/",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inventory"),
  (req, res, next) => getController().list(req, res, next)
);

router.get(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inventory"),
  validateObjectId("id"),
  (req, res, next) => getController().getById(req, res, next)
);

router.get(
  "/:id/movements",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inventory"),
  validateObjectId("id"),
  (req, res, next) => getController().movements(req, res, next)
);

router.post(
  "/",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inventory"),
  validateInventoryInput,
  (req, res, next) => getController().create(req, res, next)
);

router.post(
  "/:id/stock-in",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inventory"),
  validateObjectId("id"),
  validateStockMovementInput,
  (req, res, next) => getController().stockIn(req, res, next)
);

router.post(
  "/:id/stock-out",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inventory"),
  validateObjectId("id"),
  validateStockMovementInput,
  (req, res, next) => getController().stockOut(req, res, next)
);

router.post(
  "/:id/adjust",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inventory"),
  validateObjectId("id"),
  validateStockMovementInput,
  (req, res, next) => getController().adjust(req, res, next)
);

router.patch(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inventory"),
  validateObjectId("id"),
  validateInventoryInput,
  (req, res, next) => getController().update(req, res, next)
);

router.delete(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inventory"),
  validateObjectId("id"),
  (req, res, next) => getController().remove(req, res, next)
);

export { router as inventoryRoutes };
