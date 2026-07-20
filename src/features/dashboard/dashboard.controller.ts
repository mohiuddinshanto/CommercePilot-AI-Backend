import { Request, Response, NextFunction } from "express";
import { getDashboardService } from "./dashboard.service.js";
import { getStoreId } from "../../utils/store.js";
import { sendSuccess } from "../../utils/api-response.js";

export class DashboardController {
  private service = getDashboardService();

  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const data = await this.service.getDashboardSummary(storeId);
      sendSuccess(res, "Dashboard summary retrieved.", data);
    } catch (error) {
      next(error);
    }
  }

  async getActivities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;

      const result = await this.service.getRecentActivities(storeId, limit, page);
      const totalPages = Math.ceil(result.total / limit) || 1;

      sendSuccess(res, "Recent activities retrieved.", {
        items: result.items,
        total: result.total,
        page,
        pageSize: limit,
        totalPages,
      });
    } catch (error) {
      next(error);
    }
  }
}
