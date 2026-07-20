import { Router } from "express";
import { CategoryController } from "./category.controller";
import {
  requireAuth,
  requireStoreAccess,
  requireStoreApproved,
  requirePermission,
} from "../../middleware/auth.middleware";
import { validateObjectId } from "../../middleware/validation.middleware";
import { validateCategoryInput } from "./category.validation";

const router = Router();

function getController(): CategoryController {
  return new CategoryController();
}

router.get(
  "/",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("categories"),
  (req, res, next) => getController().list(req, res, next)
);

router.get(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("categories"),
  validateObjectId("id"),
  (req, res, next) => getController().getById(req, res, next)
);

router.post(
  "/",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("categories"),
  validateCategoryInput,
  (req, res, next) => getController().create(req, res, next)
);

router.patch(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("categories"),
  validateObjectId("id"),
  validateCategoryInput,
  (req, res, next) => getController().update(req, res, next)
);

router.delete(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("categories"),
  validateObjectId("id"),
  (req, res, next) => getController().remove(req, res, next)
);

export { router as categoryRoutes };
