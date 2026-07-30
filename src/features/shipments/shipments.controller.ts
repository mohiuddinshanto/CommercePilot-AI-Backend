import { Request, Response, NextFunction } from "express";
import { getShipmentService } from "./shipments.service.js";
import { getStoreId } from "../../utils/store.js";
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from "../../utils/api-response.js";

export class ShipmentController {
  private service = getShipmentService();

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const shipment = await this.service.createShipment(storeId, req.user!.id, req.body);
      sendCreated(res, "Shipment created successfully.", shipment);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const result = await this.service.getShipments(storeId, req.query as Record<string, string>);
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
      const shipment = await this.service.getShipmentById(storeId, id);
      sendSuccess(res, "Shipment retrieved successfully.", shipment);
    } catch (error) {
      next(error);
    }
  }

  async getBySaleId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const saleId = String(req.params.saleId);
      const shipments = await this.service.getShipmentsBySale(storeId, saleId);
      sendSuccess(res, "Shipments retrieved successfully.", shipments);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const shipment = await this.service.updateShipment(storeId, req.user!.id, id, req.body);
      sendSuccess(res, "Shipment updated successfully.", shipment);
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      await this.service.deleteShipment(storeId, req.user!.id, id);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }
}
