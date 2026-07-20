import { Request, Response, NextFunction } from "express";
import { getSaleService } from "./sales.service.js";
import { getStoreId } from "../../utils/store.js";
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from "../../utils/api-response.js";

export class SaleController {
  private service = getSaleService();

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const sale = await this.service.createSale(
        storeId,
        req.user!.id,
        req.body
      );
      sendCreated(res, "Sale created successfully.", sale);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const result = await this.service.getSales(storeId, req.query as Record<string, string>);
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
      const sale = await this.service.getSaleById(storeId, id);
      sendSuccess(res, "Sale retrieved successfully.", sale);
    } catch (error) {
      next(error);
    }
  }

  async getByInvoiceNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const invoiceNumber = String(req.params.invoiceNumber);
      const sale = await this.service.getSaleByInvoiceNumber(storeId, invoiceNumber);
      sendSuccess(res, "Sale retrieved successfully.", sale);
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      const sale = await this.service.updateSale(
        storeId,
        req.user!.id,
        id,
        req.body
      );
      sendSuccess(res, "Sale updated successfully.", sale);
    } catch (error) {
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const id = String(req.params.id);
      await this.service.deleteSale(storeId, req.user!.id, id);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }

  async todaySales(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const sales = await this.service.getTodaySales(storeId);
      sendSuccess(res, "Today's sales retrieved.", sales);
    } catch (error) {
      next(error);
    }
  }

  async summary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const summaryData = await this.service.getSalesSummary(storeId);
      sendSuccess(res, "Sales summary retrieved.", summaryData);
    } catch (error) {
      next(error);
    }
  }
}
