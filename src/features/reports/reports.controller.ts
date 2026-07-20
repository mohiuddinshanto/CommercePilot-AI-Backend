import { Request, Response, NextFunction } from "express";
import { getReportsService } from "./reports.service.js";
import { getStoreId } from "../../utils/store.js";
import { sendSuccess } from "../../utils/api-response.js";
import { ReportQueryParams } from "./reports.types.js";

export class ReportsController {
  private service = getReportsService();

  private getParams(req: Request): ReportQueryParams {
    return {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      period: req.query.period as ReportQueryParams["period"],
      categoryId: req.query.categoryId as string | undefined,
      productId: req.query.productId as string | undefined,
      paymentMethod: req.query.paymentMethod as string | undefined,
    };
  }

  async dashboardSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const data = await this.service.getDashboardSummary(storeId);
      sendSuccess(res, "Dashboard summary retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async salesReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const params = this.getParams(req);
      const data = await this.service.getSalesReport(storeId, params);
      sendSuccess(res, "Sales report retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async topProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const params = this.getParams(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const data = await this.service.getTopProducts(storeId, params, limit);
      sendSuccess(res, "Top products retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async topCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const params = this.getParams(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const data = await this.service.getTopCategories(storeId, params, limit);
      sendSuccess(res, "Top categories retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async topCustomers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const params = this.getParams(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const data = await this.service.getTopCustomers(storeId, params, limit);
      sendSuccess(res, "Top customers retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async bestCashiers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const params = this.getParams(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const data = await this.service.getBestCashiers(storeId, params, limit);
      sendSuccess(res, "Best cashiers retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async salesByPaymentMethod(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const params = this.getParams(req);
      const data = await this.service.getSalesByPaymentMethod(storeId, params);
      sendSuccess(res, "Sales by payment method retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async salesByDay(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const params = this.getParams(req);
      const data = await this.service.getSalesByDay(storeId, params);
      sendSuccess(res, "Sales by day retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async salesByMonth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const params = this.getParams(req);
      const data = await this.service.getSalesByMonth(storeId, params);
      sendSuccess(res, "Sales by month retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async inventoryValue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const data = await this.service.getInventoryValue(storeId);
      sendSuccess(res, "Inventory value retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async lowStockProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const data = await this.service.getLowStockProducts(storeId, limit);
      sendSuccess(res, "Low stock products retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async deadStockProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const data = await this.service.getDeadStockProducts(storeId, limit);
      sendSuccess(res, "Dead stock products retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async profitReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const params = this.getParams(req);
      const data = await this.service.getProfitReport(storeId, params);
      sendSuccess(res, "Profit report retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async mostReturnedProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const params = this.getParams(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const data = await this.service.getMostReturnedProducts(storeId, params, limit);
      sendSuccess(res, "Most returned products retrieved.", data);
    } catch (error) {
      next(error);
    }
  }
}
