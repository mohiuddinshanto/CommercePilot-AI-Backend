import { Router } from "express";
import { AIController } from "./ai.controller.js";
import { validateChatInput } from "./ai.validation.js";
import {
  requireAuth,
  requireStoreAccess,
  requireStoreApproved,
  requirePermission,
} from "../../middleware/auth.middleware.js";
import { validateObjectId } from "../../middleware/validation.middleware.js";

const router = Router();

function getController(): AIController {
  return new AIController();
}

router.post(
  "/chat/stream",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("ai"),
  validateChatInput,
  (req, res, next) => getController().streamChat(req, res, next)
);
router.post(
  "/chat",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("ai"),
  validateChatInput,
  (req, res, next) => getController().chat(req, res, next)
);

router.post(
  "/generate",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("ai"),
  (req, res, next) => getController().generate(req, res, next)
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


