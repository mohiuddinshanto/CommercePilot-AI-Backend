import { Request, Response, NextFunction } from "express";
import { getProductService } from "./product.service";
import { getStoreId } from "../../utils/store";
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from "../../utils/api-response";

export class ProductController {
  private service = getProductService();

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const product = await this.service.createProduct(
        storeId,
        req.user!.id,
        req.body
      );
      sendCreated(res, "Product created successfully.", product);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const result = await this.service.getProducts(storeId, req.query as Record<string, string>);
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
      const productId = String(req.params.id);
      const product = await this.service.getProductById(
        storeId,
        productId
      );
      sendSuccess(res, "Product retrieved successfully.", product);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const productId = String(req.params.id);
      const product = await this.service.updateProduct(
        storeId,
        req.user!.id,
        productId,
        req.body
      );
      sendSuccess(res, "Product updated successfully.", product);
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const productId = String(req.params.id);
      await this.service.deleteProduct(
        storeId,
        req.user!.id,
        productId
      );
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }

  async lowStock(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(_req);
      const products = await this.service.getLowStockProducts(storeId);
      sendSuccess(res, "Low stock products retrieved.", products);
    } catch (error) {
      next(error);
    }
  }

  async deadStock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const daysParam = req.query.days;
      const days = typeof daysParam === "string" ? Number(daysParam) : 90;
      const products = await this.service.getDeadStockProducts(storeId, days);
      sendSuccess(res, "Dead stock products retrieved.", products);
    } catch (error) {
      next(error);
    }
  }
}
