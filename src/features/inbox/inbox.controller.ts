import { Request, Response, NextFunction } from "express";
import { getInboxService } from "./inbox.service.js";
import { getStoreId } from "../../utils/store.js";
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from "../../utils/api-response.js";
import { logger } from "../../utils/logger.js";

export class InboxController {
  private service = getInboxService();

  async connectPage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const connection = await this.service.connectPage(storeId, req.user!.id, req.body);
      sendCreated(res, "Facebook page connected successfully.", connection);
    } catch (error) {
      next(error);
    }
  }

  async listConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const connections = await this.service.getConnections(storeId);
      sendSuccess(res, "Connections retrieved successfully.", connections);
    } catch (error) {
      next(error);
    }
  }

  async updateConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const connection = await this.service.updateConnection(storeId, req.user!.id, id, req.body);
      sendSuccess(res, "Connection updated successfully.", connection);
    } catch (error) {
      next(error);
    }
  }

  async disconnectPage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      await this.service.disconnectPage(storeId, req.user!.id, id);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }

  async listConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const result = await this.service.getConversations(storeId, req.query as Record<string, string>);
      sendPaginated(res, result.items, {
        page: result.page,
        limit: result.pageSize,
        totalItems: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
        hasPrevious: result.page > 1,
      });
    } catch (error) {
      next(error);
    }
  }

  async listMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const result = await this.service.getMessages(storeId, id, req.query as Record<string, string>);
      sendPaginated(res, result.items, {
        page: result.page,
        limit: result.pageSize,
        totalItems: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
        hasPrevious: result.page > 1,
      });
    } catch (error) {
      next(error);
    }
  }

  async sendReply(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const userName = req.user!.name;
      const message = await this.service.sendReply(storeId, req.user!.id, userName, id, req.body);
      sendCreated(res, "Message sent successfully.", message);
    } catch (error) {
      next(error);
    }
  }

  async updateConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const conversation = await this.service.updateConversation(storeId, req.user!.id, id, req.body);
      sendSuccess(res, "Conversation updated successfully.", conversation);
    } catch (error) {
      next(error);
    }
  }

  async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      await this.service.markConversationRead(storeId, id);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }

  async listReplyActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const result = await this.service.getReplyActivity(storeId, req.query as Record<string, string>);
      sendPaginated(res, result.items, {
        page: result.page,
        limit: result.pageSize,
        totalItems: result.total,
        totalPages: result.totalPages,
        hasNext: result.page < result.totalPages,
        hasPrevious: result.page > 1,
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const challenge = this.service.verifyWebhook(
        req.query["hub.mode"],
        req.query["hub.verify_token"],
        req.query["hub.challenge"]
      );
      res.status(200).send(challenge);
    } catch (error) {
      next(error);
    }
  }

  async receiveWebhook(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const rawBody = req.body as unknown;
      let payload: Record<string, unknown> = {};
      if (Buffer.isBuffer(rawBody)) {
        payload = JSON.parse(rawBody.toString("utf8"));
      } else if (typeof rawBody === "string") {
        payload = JSON.parse(rawBody);
      } else if (rawBody && typeof rawBody === "object") {
        payload = rawBody as Record<string, unknown>;
      }
      await this.service.handleWebhookEvent(payload);
      res.status(200).send("EVENT_RECEIVED");
    } catch (error) {
      logger.error("Meta webhook processing error", error);
      res.status(200).send("EVENT_RECEIVED");
    }
  }
}

let instance: InboxController | null = null;

export function getInboxController(): InboxController {
  if (!instance) {
    instance = new InboxController();
  }
  return instance;
}
