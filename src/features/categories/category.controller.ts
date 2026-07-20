import { Request, Response, NextFunction } from "express";
import { getCategoryService } from "./category.service";
import { getStoreId } from "../../utils/store";
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from "../../utils/api-response";

export class CategoryController {
  private service = getCategoryService();

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const category = await this.service.createCategory(
        storeId,
        req.user!.id,
        req.body
      );
      sendCreated(res, "Category created successfully.", category);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const result = await this.service.getCategories(storeId, req.query as Record<string, string>);
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
      const categoryId = String(req.params.id);
      const category = await this.service.getCategoryById(
        storeId,
        categoryId
      );
      sendSuccess(res, "Category retrieved successfully.", category);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const categoryId = String(req.params.id);
      const category = await this.service.updateCategory(
        storeId,
        req.user!.id,
        categoryId,
        req.body
      );
      sendSuccess(res, "Category updated successfully.", category);
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const categoryId = String(req.params.id);
      await this.service.deleteCategory(
        storeId,
        req.user!.id,
        categoryId
      );
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }
}
