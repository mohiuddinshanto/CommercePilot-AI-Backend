import { Router } from "express";
import { authRoutes } from "../features/auth/auth.routes.js";
import { productRoutes } from "../features/products/product.routes.js";
import { categoryRoutes } from "../features/categories/category.routes.js";
import { inventoryRoutes } from "../features/inventory/inventory.routes.js";
import { bundleRoutes } from "../features/bundles/bundles.routes.js";
import { saleRoutes } from "../features/sales/sales.routes.js";
import { returnRoutes } from "../features/returns/returns.routes.js";
import { staffRoutes } from "../features/staff/staff.routes.js";
import { reportRoutes } from "../features/reports/reports.routes.js";
import { aiRoutes } from "../features/ai/ai.routes.js";
import { subscriptionRoutes } from "../features/subscriptions/subscription.routes.js";
import { shipmentRoutes } from "../features/shipments/shipments.routes.js";
import { adminRoutes } from "../features/admin/admin.routes.js";
import { dashboardRoutes } from "../features/dashboard/dashboard.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/inventory", inventoryRoutes);
router.use("/bundles", bundleRoutes);
router.use("/sales", saleRoutes);
router.use("/returns", returnRoutes);
router.use("/staff", staffRoutes);
router.use("/reports", reportRoutes);
router.use("/ai", aiRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/admin", adminRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/shipments", shipmentRoutes);

export { router as apiRoutes };
