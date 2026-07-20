import { Request, Response, NextFunction } from "express";
import { getReturnService } from "./returns.service";
import { getStoreId } from "../../utils/store";
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from "../../utils/api-response";

export class ReturnController {
  private service = getReturnService();

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const returnDoc = await this.service.createReturn(
        storeId,
        req.user!.id,
        req.body
      );
      sendCreated(res, "Return created successfully.", returnDoc);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const result = await this.service.getReturns(storeId, req.query as Record<string, string>);
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

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const returnDoc = await this.service.getReturnById(storeId, id);
      sendSuccess(res, "Return retrieved successfully.", returnDoc);
    } catch (error) {
      next(error);
    }
  }

  async getByInvoiceNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const invoiceNumber = String(req.params.invoiceNumber);
      const returns = await this.service.getReturnByInvoiceNumber(storeId, invoiceNumber);
      sendSuccess(res, "Returns retrieved successfully.", returns);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const returnDoc = await this.service.updateReturn(
        storeId,
        req.user!.id,
        id,
        req.body
      );
      sendSuccess(res, "Return updated successfully.", returnDoc);
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      await this.service.deleteReturn(storeId, req.user!.id, id);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }

  async summary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const summaryData = await this.service.getReturnsSummary(storeId);
      sendSuccess(res, "Returns summary retrieved.", summaryData);
    } catch (error) {
      next(error);
    }
  }
}
