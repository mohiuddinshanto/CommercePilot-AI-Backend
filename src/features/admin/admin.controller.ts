import { Request, Response, NextFunction } from "express";
import { getAdminService } from "./admin.service";
import { sendSuccess, sendPaginated } from "../../utils/api-response";

export class AdminController {
  private service = getAdminService();

  async getDashboard(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dashboard = await this.service.getDashboard();
      sendSuccess(res, "Dashboard retrieved.", dashboard);
    } catch (error) {
      next(error);
    }
  }

  async getStores(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.getStores({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        search: req.query.search as string,
        status: req.query.status as string,
        plan: req.query.plan as string,
        sortBy: req.query.sortBy as string,
        order: req.query.order as "asc" | "desc",
      });
      sendPaginated(res, result.items, {
        page: result.page,
        limit: result.pageSize,
        totalItems: result.total,
        totalPages: result.totalPages,
        hasNext: result.page * result.pageSize < result.total,
        hasPrevious: result.page > 1,
      });
    } catch (error) {
      next(error);
    }
  }

  async getStore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const store = await this.service.getStore(String(req.params.id));
      sendSuccess(res, "Store retrieved.", store);
    } catch (error) {
      next(error);
    }
  }

  async updateStoreStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      await this.service.updateStoreStatus(String(req.params.id), req.body, userId);
      sendSuccess(res, "Store status updated.", null);
    } catch (error) {
      next(error);
    }
  }

  async getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.getUsers({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        search: req.query.search as string,
        status: req.query.status as string,
        role: req.query.role as string,
        sortBy: req.query.sortBy as string,
        order: req.query.order as "asc" | "desc",
      });
      sendPaginated(res, result.items, {
        page: result.page,
        limit: result.pageSize,
        totalItems: result.total,
        totalPages: result.totalPages,
        hasNext: result.page * result.pageSize < result.total,
        hasPrevious: result.page > 1,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUserStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      await this.service.updateUserStatus(String(req.params.id), req.body, userId);
      sendSuccess(res, "User status updated.", null);
    } catch (error) {
      next(error);
    }
  }

  async getSubscriptions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.getSubscriptions({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        search: req.query.search as string,
        status: req.query.status as string,
        plan: req.query.plan as string,
        sortBy: req.query.sortBy as string,
        order: req.query.order as "asc" | "desc",
      });
      sendPaginated(res, result.items, {
        page: result.page,
        limit: result.pageSize,
        totalItems: result.total,
        totalPages: result.totalPages,
        hasNext: result.page * result.pageSize < result.total,
        hasPrevious: result.page > 1,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      await this.service.updateSubscription(String(req.params.id), req.body, userId);
      sendSuccess(res, "Subscription updated.", null);
    } catch (error) {
      next(error);
    }
  }

  async getActivityLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.getActivityLogs({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        storeId: req.query.storeId as string,
        action: req.query.action as string,
        module: req.query.module as string,
      });
      sendPaginated(res, result.items, {
        page: result.page,
        limit: result.pageSize,
        totalItems: result.total,
        totalPages: result.totalPages,
        hasNext: result.page * result.pageSize < result.total,
        hasPrevious: result.page > 1,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSystemStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await this.service.getSystemStats();
      sendSuccess(res, "System stats retrieved.", stats);
    } catch (error) {
      next(error);
    }
  }
}
