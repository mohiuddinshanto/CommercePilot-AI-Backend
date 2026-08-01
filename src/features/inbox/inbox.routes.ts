import { Router } from "express";
import { InboxController } from "./inbox.controller.js";
import {
  requireAuth,
  requireStoreAccess,
  requireStoreApproved,
  requirePermission,
} from "../../middleware/auth.middleware.js";
import { validateObjectId } from "../../middleware/validation.middleware.js";
import {
  validateCreateConnection,
  validateUpdateConnection,
  validateSendMessage,
  validateUpdateConversation,
} from "./inbox.validation.js";

const router = Router();

function getController(): InboxController {
  return new InboxController();
}

// ── connections ──

router.get(
  "/connections",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inbox"),
  (req, res, next) => getController().listConnections(req, res, next)
);

router.post(
  "/connections",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inbox"),
  validateCreateConnection,
  (req, res, next) => getController().connectPage(req, res, next)
);

router.patch(
  "/connections/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inbox"),
  validateObjectId("id"),
  validateUpdateConnection,
  (req, res, next) => getController().updateConnection(req, res, next)
);

router.delete(
  "/connections/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inbox"),
  validateObjectId("id"),
  (req, res, next) => getController().disconnectPage(req, res, next)
);

// ── conversations ──

router.get(
  "/conversations",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inbox"),
  (req, res, next) => getController().listConversations(req, res, next)
);

router.get(
  "/conversations/:id/messages",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inbox"),
  validateObjectId("id"),
  (req, res, next) => getController().listMessages(req, res, next)
);

router.post(
  "/conversations/:id/messages",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inbox"),
  validateObjectId("id"),
  validateSendMessage,
  (req, res, next) => getController().sendReply(req, res, next)
);

router.patch(
  "/conversations/:id",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inbox"),
  validateObjectId("id"),
  validateUpdateConversation,
  (req, res, next) => getController().updateConversation(req, res, next)
);

router.post(
  "/conversations/:id/read",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inbox"),
  validateObjectId("id"),
  (req, res, next) => getController().markRead(req, res, next)
);

// ── activity ──

router.get(
  "/activity",
  requireAuth(),
  requireStoreAccess(),
  requireStoreApproved(),
  requirePermission("inbox"),
  (req, res, next) => getController().listReplyActivity(req, res, next)
);

export { router as inboxRoutes };
