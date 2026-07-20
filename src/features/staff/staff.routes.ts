import { Router } from "express";
import { StaffController } from "./staff.controller.js";
import {
  requireAuth,
  requireStoreAccess,
  requireStoreApproved,
  requirePermission,
} from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validateObjectId } from "../../middleware/validation.middleware.js";
import { validateStaffInput, validateAcceptInvitation } from "./staff.validation.js";

const router = Router();

function getController(): StaffController {
  return new StaffController();
}

router.get(
  "/",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("staff"),
  (req, res, next) => getController().list(req, res, next)
);

router.get(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("staff"),
  validateObjectId("id"),
  (req, res, next) => getController().getById(req, res, next)
);

router.post(
  "/invite",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requireRole("owner"),
  validateStaffInput,
  (req, res, next) => getController().invite(req, res, next)
);

router.post(
  "/accept",
  requireAuth(),
  requireStoreAccess(),
  validateAcceptInvitation,
  (req, res, next) => getController().accept(req, res, next)
);

router.patch(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requireRole("owner"),
  validateObjectId("id"),
  validateStaffInput,
  (req, res, next) => getController().update(req, res, next)
);

router.patch(
  "/:id/suspend",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requireRole("owner"),
  validateObjectId("id"),
  (req, res, next) => getController().suspend(req, res, next)
);

router.patch(
  "/:id/activate",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requireRole("owner"),
  validateObjectId("id"),
  (req, res, next) => getController().activate(req, res, next)
);

router.delete(
  "/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requireRole("owner"),
  validateObjectId("id"),
  (req, res, next) => getController().remove(req, res, next)
);

export { router as staffRoutes };
