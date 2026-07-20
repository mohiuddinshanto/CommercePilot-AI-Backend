import { Request, Response, NextFunction } from "express";
import { getBundleService } from "./bundles.service.js";
import { getStoreId } from "../../utils/store.js";
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from "../../utils/api-response.js";

export class BundleController {
  private service = getBundleService();

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const bundle = await this.service.createBundle(
        storeId,
        req.user!.id,
        req.body
      );
      sendCreated(res, "Bundle created successfully.", bundle);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const result = await this.service.getBundles(storeId, req.query as Record<string, string>);
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
      const bundle = await this.service.getBundleById(storeId, id);
      sendSuccess(res, "Bundle retrieved successfully.", bundle);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const bundle = await this.service.updateBundle(
        storeId,
        req.user!.id,
        id,
        req.body
      );
      sendSuccess(res, "Bundle updated successfully.", bundle);
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      await this.service.deleteBundle(storeId, req.user!.id, id);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }

  async stock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const result = await this.service.getBundleStock(storeId, id);
      sendSuccess(res, "Bundle stock retrieved successfully.", result);
    } catch (error) {
      next(error);
    }
  }
}
