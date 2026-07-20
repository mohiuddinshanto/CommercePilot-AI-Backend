import { Router } from "express";
import { authRoutes } from "../features/auth/auth.routes";
import { productRoutes } from "../features/products/product.routes";
import { categoryRoutes } from "../features/categories/category.routes";
import { inventoryRoutes } from "../features/inventory/inventory.routes";
import { bundleRoutes } from "../features/bundles/bundles.routes";
import { saleRoutes } from "../features/sales/sales.routes";
import { returnRoutes } from "../features/returns/returns.routes";
import { staffRoutes } from "../features/staff/staff.routes";
import { reportRoutes } from "../features/reports/reports.routes";
import { aiRoutes } from "../features/ai/ai.routes";
import { subscriptionRoutes } from "../features/subscriptions/subscription.routes";
import { adminRoutes } from "../features/admin/admin.routes";

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

export { router as apiRoutes };
