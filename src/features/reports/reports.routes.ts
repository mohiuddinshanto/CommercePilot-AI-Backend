import { Router } from "express";
import { ReportsController } from "./reports.controller.js";
import {
  requireAuth,
  requireStoreAccess,
  requireStoreApproved,
  requirePermission,
} from "../../middleware/auth.middleware.js";

const router = Router();

function getController(): ReportsController {
  return new ReportsController();
}

router.get(
  "/dashboard-summary",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().dashboardSummary(req, res, next)
);

router.get(
  "/sales",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().salesReport(req, res, next)
);

router.get(
  "/top-products",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().topProducts(req, res, next)
);

router.get(
  "/top-categories",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().topCategories(req, res, next)
);

router.get(
  "/top-customers",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().topCustomers(req, res, next)
);

router.get(
  "/best-cashiers",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().bestCashiers(req, res, next)
);

router.get(
  "/sales-by-payment-method",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().salesByPaymentMethod(req, res, next)
);

router.get(
  "/sales-by-day",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().salesByDay(req, res, next)
);

router.get(
  "/sales-by-month",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().salesByMonth(req, res, next)
);

router.get(
  "/inventory-value",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().inventoryValue(req, res, next)
);

router.get(
  "/low-stock",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().lowStockProducts(req, res, next)
);

router.get(
  "/dead-stock",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().deadStockProducts(req, res, next)
);

router.get(
  "/profit",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().profitReport(req, res, next)
);

router.get(
  "/most-returned",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("reports"),
  (req, res, next) => getController().mostReturnedProducts(req, res, next)
);

export { router as reportRoutes };
