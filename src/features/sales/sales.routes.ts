import { Router } from "express";
import { SaleController } from "./sales.controller";
import {
  requireAuth,
  requireStoreAccess,
  requireStoreApproved,
  requirePermission,
} from "../../middleware/auth.middleware";
import { validateObjectId } from "../../middleware/validation.middleware";
import { validateSaleInput } from "./sales.validation";

const router = Router();

function getController(): SaleController {
  return new SaleController();
}

router.get(
  "/today",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("sales"),
  (req, res, next) => getController().todaySales(req, res, next)
);

router.get(
  "/summary",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("sales"),
  (req, res, next) => getController().summary(req, res, next)
);

router.get(
  "/invoice/:invoiceNumber",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("sales"),
  (req, res, next) => getController().getByInvoiceNumber(req, res, next)
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
  validateSaleInput,
  (req, res, next) => getController().create(req, res, next)
);

router.patch(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("sales"),
  validateObjectId("id"),
  validateSaleInput,
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

export { router as saleRoutes };
