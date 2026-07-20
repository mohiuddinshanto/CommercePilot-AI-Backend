import { Request, Response, NextFunction } from "express";
import { getAIService } from "./ai.service.js";
import { getStoreId } from "../../utils/store.js";
import { sendSuccess, sendPaginated, sendNoContent } from "../../utils/api-response.js";
import { parsePaginationParams } from "../../utils/pagination.js";

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

  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const userId = req.user!.id;
      const userPlan = req.user!.plan || "starter";
      const { contentType, titleOrKeywords, keyFeatures, tone, length } = req.body;

      const result = await this.service.generateContent(
        storeId,
        userId,
        { contentType, titleOrKeywords, keyFeatures, tone, length },
        userPlan
      );
      sendSuccess(res, "Content generated successfully.", result);
    } catch (error) {
      next(error);
    }
  }

  async streamChat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req); const userId = req.user!.id; const userPlan = req.user!.plan || "starter";
      const { message, conversationId, model } = req.body;
      res.status(200); res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache, no-transform"); res.setHeader("Connection", "keep-alive"); res.flushHeaders();
      const result = await this.service.chat(storeId, userId, { message, conversationId, model }, userPlan);
      for (let index = 0; index < result.assistantMessage.content.length; index += 24) res.write(`data: ${JSON.stringify({ type: "token", content: result.assistantMessage.content.slice(index, index + 24) })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done", conversationId: result.conversationId })}\n\n`); res.end();
    } catch (error) { if (!res.headersSent) next(error); else { res.write(`data: ${JSON.stringify({ type: "error", message: "Unable to generate a response." })}\n\n`); res.end(); } }
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

