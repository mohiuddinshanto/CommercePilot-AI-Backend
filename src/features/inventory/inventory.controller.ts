import { Request, Response, NextFunction } from "express";
import { getInventoryService } from "./inventory.service";
import { getStoreId } from "../../utils/store";
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from "../../utils/api-response";

export class InventoryController {
  private service = getInventoryService();

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const inventory = await this.service.createInventory(
        storeId,
        req.user!.id,
        req.body
      );
      sendCreated(res, "Inventory record created successfully.", inventory);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const result = await this.service.getInventory(storeId, req.query as Record<string, string>);
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
      const inventory = await this.service.getInventoryById(storeId, id);
      sendSuccess(res, "Inventory record retrieved successfully.", inventory);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const inventory = await this.service.updateInventory(
        storeId,
        req.user!.id,
        id,
        req.body
      );
      sendSuccess(res, "Inventory record updated successfully.", inventory);
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      await this.service.deleteInventory(storeId, req.user!.id, id);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }

  async stockIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const inventory = await this.service.stockIn(storeId, req.user!.id, id, req.body);
      sendSuccess(res, "Stock in recorded successfully.", inventory);
    } catch (error) {
      next(error);
    }
  }

  async stockOut(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const inventory = await this.service.stockOut(storeId, req.user!.id, id, req.body);
      sendSuccess(res, "Stock out recorded successfully.", inventory);
    } catch (error) {
      next(error);
    }
  }

  async adjust(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const inventory = await this.service.adjustStock(storeId, req.user!.id, id, req.body);
      sendSuccess(res, "Stock adjustment recorded successfully.", inventory);
    } catch (error) {
      next(error);
    }
  }

  async lowStock(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(_req);
      const items = await this.service.getLowStock(storeId);
      sendSuccess(res, "Low stock items retrieved.", items);
    } catch (error) {
      next(error);
    }
  }

  async outOfStock(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(_req);
      const items = await this.service.getOutOfStock(storeId);
      sendSuccess(res, "Out of stock items retrieved.", items);
    } catch (error) {
      next(error);
    }
  }

  async movements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const inventoryId = String(req.params.id);
      const movements = await this.service.getMovements(storeId, inventoryId);
      sendSuccess(res, "Inventory movements retrieved.", movements);
    } catch (error) {
      next(error);
    }
  }
}
