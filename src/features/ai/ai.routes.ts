import { Router } from "express";
import { AIController } from "./ai.controller";
import { validateChatInput } from "./ai.validation";
import {
  requireAuth,
  requireStoreAccess,
  requireStoreApproved,
  requirePermission,
} from "../../middleware/auth.middleware";
import { validateObjectId } from "../../middleware/validation.middleware";

const router = Router();

function getController(): AIController {
  return new AIController();
}

router.post(
  "/chat",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("ai"),
  validateChatInput,
  (req, res, next) => getController().chat(req, res, next)
);

router.get(
  "/conversations",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("ai"),
  (req, res, next) => getController().listConversations(req, res, next)
);

router.get(
  "/conversations/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("ai"),
  validateObjectId("id"),
  (req, res, next) => getController().getConversation(req, res, next)
);

router.delete(
  "/conversations/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("ai"),
  validateObjectId("id"),
  (req, res, next) => getController().deleteConversation(req, res, next)
);

export { router as aiRoutes };
