import { Request, Response, NextFunction } from "express";
import { getAIService } from "./ai.service";
import { getStoreId } from "../../utils/store";
import { sendSuccess, sendPaginated, sendNoContent } from "../../utils/api-response";
import { parsePaginationParams } from "../../utils/pagination";

export class AIController {
  private service = getAIService();

  async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const userId = req.user!.id;
      const userPlan = req.user!.plan || "starter";
      const { message, conversationId, model } = req.body;

      const result = await this.service.chat(storeId, userId, { message, conversationId, model }, userPlan);
      sendSuccess(res, "AI response generated.", result);
    } catch (error) {
      next(error);
    }
  }

  async listConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const userId = req.user!.id;
      const { page, limit } = parsePaginationParams(req.query as { page?: string; limit?: string });

      const { items, total } = await this.service.getConversations(storeId, userId, page, limit);
      sendPaginated(res, items, {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrevious: page > 1,
      });
    } catch (error) {
      next(error);
    }
  }

  async getConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const userId = req.user!.id;
      const id = req.params.id as string;

      const conversation = await this.service.getConversation(id, storeId, userId);
      sendSuccess(res, "Conversation retrieved.", conversation);
    } catch (error) {
      next(error);
    }
  }

  async deleteConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const userId = req.user!.id;
      const id = req.params.id as string;

      await this.service.deleteConversation(id, storeId, userId);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }
}
