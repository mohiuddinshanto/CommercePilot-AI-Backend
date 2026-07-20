import { Request, Response, NextFunction } from "express";
import { getSubscriptionService } from "./subscription.service.js";
import { getStoreId } from "../../utils/store.js";
import { sendSuccess, sendCreated } from "../../utils/api-response.js";

export class SubscriptionController {
  private service = getSubscriptionService();

  async createSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const userId = req.user!.id;
      const { plan, billingCycle } = req.body;

      const subscription = await this.service.createSubscription(storeId, userId, { plan, billingCycle });
      sendCreated(res, "Subscription created successfully.", subscription);
    } catch (error) {
      next(error);
    }
  }

  async getSubscription(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(_req);
      const subscription = await this.service.getSubscription(storeId);
      sendSuccess(res, "Subscription retrieved.", subscription ?? null);
    } catch (error) {
      next(error);
    }
  }

  async upgradePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const userId = req.user!.id;
      const { plan, billingCycle } = req.body;

      const subscription = await this.service.upgradePlan(storeId, userId, { plan, billingCycle });
      sendSuccess(res, "Plan upgraded successfully.", subscription);
    } catch (error) {
      next(error);
    }
  }

  async downgradePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(req);
      const userId = req.user!.id;
      const { plan, billingCycle } = req.body;

      const subscription = await this.service.downgradePlan(storeId, userId, { plan, billingCycle });
      sendSuccess(res, "Plan downgraded successfully.", subscription);
    } catch (error) {
      next(error);
    }
  }

  async cancelSubscription(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(_req);
      const userId = _req.user!.id;

      const subscription = await this.service.cancelSubscription(storeId, userId);
      sendSuccess(res, "Subscription cancelled.", subscription);
    } catch (error) {
      next(error);
    }
  }

  async renewSubscription(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(_req);
      const userId = _req.user!.id;

      const subscription = await this.service.renewSubscription(storeId, userId);
      sendSuccess(res, "Subscription renewed.", subscription);
    } catch (error) {
      next(error);
    }
  }

  async getUsage(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(_req);
      const subscription = await this.service.getSubscription(storeId);
      if (!subscription) {
        sendSuccess(res, "Usage retrieved.", null);
        return;
      }
      sendSuccess(res, "Usage retrieved.", subscription.usage);
    } catch (error) {
      next(error);
    }
  }

  async getBillingHistory(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storeId = getStoreId(_req);
      const records = await this.service.getBillingHistory(storeId);
      sendSuccess(res, "Billing history retrieved.", records);
    } catch (error) {
      next(error);
    }
  }
}
