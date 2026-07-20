import { Router } from "express";
import { ProductController } from "./product.controller.js";
import {
  requireAuth,
  requireStoreAccess,
  requireStoreApproved,
  requirePermission,
} from "../../middleware/auth.middleware.js";
import { validateObjectId } from "../../middleware/validation.middleware.js";
import { validateProductInput } from "./product.validation.js";

const router = Router();

function getController(): ProductController {
  return new ProductController();
}

router.get(
  "/low-stock",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("products"),
  (req, res, next) => getController().lowStock(req, res, next)
);

router.get(
  "/dead-stock",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("products"),
  (req, res, next) => getController().deadStock(req, res, next)
);

router.get(
  "/",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("products"),
  (req, res, next) => getController().list(req, res, next)
);

router.get(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("products"),
  validateObjectId("id"),
  (req, res, next) => getController().getById(req, res, next)
);

router.post(
  "/",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("products"),
  validateProductInput,
  (req, res, next) => getController().create(req, res, next)
);

router.patch(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("products"),
  validateObjectId("id"),
  validateProductInput,
  (req, res, next) => getController().update(req, res, next)
);

router.delete(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("products"),
  validateObjectId("id"),
  (req, res, next) => getController().remove(req, res, next)
);

export { router as productRoutes };
