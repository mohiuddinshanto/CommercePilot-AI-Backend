import { getSubscriptionRepository } from "./subscription.repository";
import { getAuthRepository } from "../auth/auth.repository";
import {
  SubscriptionDocument,
  SubscriptionPlan,
  SubscriptionLimits,
  SubscriptionUsage,
  CreateSubscriptionInput,
  UpgradePlanInput,
  BillingRecord,
  PLAN_PRICES,
} from "./subscription.types";
import { PLAN_LIMITS, ACTIVITY_ACTION } from "../../constants";
import { NotFoundError, BusinessRuleError, ConflictError } from "../../utils/error-handler";

export class SubscriptionService {
  private repo = getSubscriptionRepository();
  private authRepository = getAuthRepository();

  async createSubscription(
    storeId: string,
    userId: string,
    input: CreateSubscriptionInput
  ): Promise<SubscriptionDocument> {
    const existing = await this.repo.findByStoreId(storeId);
    if (existing) {
      throw new ConflictError("Store already has an active subscription.");
    }

    const plan = input.plan || "starter";
    const billingCycle = input.billingCycle || "monthly";
    const limits = this.getPlanLimits(plan);
    const price = PLAN_PRICES[plan][billingCycle];
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const renewalDate = expiresAt;

    const subscription = await this.repo.create({
      storeId,
      plan,
      status: "active",
      billingCycle,
      price,
      currency: "USD",
      startedAt: now,
      expiresAt,
      renewalDate,
      isTrial: false,
      features: this.getPlanFeatures(plan),
      limits,
      usage: {
        products: 0,
        categories: 0,
        inventory: 0,
        staff: 0,
        aiRequests: 0,
        lastResetAt: now,
      },
      createdAt: now,
      updatedAt: now,
    });

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.SUBSCRIPTION_CREATED,
      module: "subscriptions",
      description: `${plan} subscription created.`,
      createdAt: now,
    });

    return subscription;
  }

  async getSubscription(storeId: string): Promise<SubscriptionDocument> {
    const subscription = await this.repo.findByStoreId(storeId);
    if (!subscription) {
      throw new NotFoundError("Subscription");
    }
    return subscription;
  }

  async upgradePlan(
    storeId: string,
    userId: string,
    input: UpgradePlanInput
  ): Promise<SubscriptionDocument> {
    const subscription = await this.repo.findByStoreId(storeId);
    if (!subscription) {
      throw new NotFoundError("Subscription");
    }

    const planOrder: SubscriptionPlan[] = ["starter", "pro", "business"];
    const currentIndex = planOrder.indexOf(subscription.plan);
    const newIndex = planOrder.indexOf(input.plan);

    if (newIndex <= currentIndex) {
      throw new BusinessRuleError("Use the downgrade endpoint to switch to a lower plan.");
    }

    const billingCycle = input.billingCycle || subscription.billingCycle;
    const limits = this.getPlanLimits(input.plan);
    const price = PLAN_PRICES[input.plan][billingCycle];
    const now = new Date().toISOString();

    const updated = await this.repo.update(storeId, {
      plan: input.plan,
      billingCycle,
      price,
      features: this.getPlanFeatures(input.plan),
      limits,
      updatedAt: now,
    });

    if (!updated) {
      throw new NotFoundError("Subscription");
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.PLAN_UPGRADED,
      module: "subscriptions",
      description: `Plan upgraded from ${subscription.plan} to ${input.plan}.`,
      createdAt: now,
    });

    return updated;
  }

  async downgradePlan(
    storeId: string,
    userId: string,
    input: UpgradePlanInput
  ): Promise<SubscriptionDocument> {
    const subscription = await this.repo.findByStoreId(storeId);
    if (!subscription) {
      throw new NotFoundError("Subscription");
    }

    const planOrder: SubscriptionPlan[] = ["starter", "pro", "business"];
    const currentIndex = planOrder.indexOf(subscription.plan);
    const newIndex = planOrder.indexOf(input.plan);

    if (newIndex >= currentIndex) {
      throw new BusinessRuleError("Use the upgrade endpoint to switch to a higher plan.");
    }

    const billingCycle = input.billingCycle || subscription.billingCycle;
    const limits = this.getPlanLimits(input.plan);
    const price = PLAN_PRICES[input.plan][billingCycle];
    const now = new Date().toISOString();

    const updated = await this.repo.update(storeId, {
      plan: input.plan,
      billingCycle,
      price,
      features: this.getPlanFeatures(input.plan),
      limits,
      updatedAt: now,
    });

    if (!updated) {
      throw new NotFoundError("Subscription");
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.PLAN_DOWNGRADED,
      module: "subscriptions",
      description: `Plan downgraded from ${subscription.plan} to ${input.plan}.`,
      createdAt: now,
    });

    return updated;
  }

  async cancelSubscription(storeId: string, userId: string): Promise<SubscriptionDocument> {
    const subscription = await this.repo.findByStoreId(storeId);
    if (!subscription) {
      throw new NotFoundError("Subscription");
    }

    if (subscription.status === "cancelled") {
      throw new BusinessRuleError("Subscription is already cancelled.");
    }

    const now = new Date().toISOString();
    const updated = await this.repo.update(storeId, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
    });

    if (!updated) {
      throw new NotFoundError("Subscription");
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.SUBSCRIPTION_CANCELLED,
      module: "subscriptions",
      description: `${subscription.plan} subscription cancelled.`,
      createdAt: now,
    });

    return updated;
  }

  async renewSubscription(storeId: string, userId: string): Promise<SubscriptionDocument> {
    const subscription = await this.repo.findByStoreId(storeId);
    if (!subscription) {
      throw new NotFoundError("Subscription");
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const renewalDate = expiresAt;

    const updated = await this.repo.update(storeId, {
      status: "active",
      expiresAt,
      renewalDate,
      cancelledAt: undefined,
      updatedAt: now.toISOString(),
    });

    if (!updated) {
      throw new NotFoundError("Subscription");
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.SUBSCRIPTION_RENEWED,
      module: "subscriptions",
      description: `${subscription.plan} subscription renewed.`,
      createdAt: now.toISOString(),
    });

    return updated;
  }

  async incrementUsage(storeId: string, field: keyof SubscriptionUsage, amount = 1): Promise<void> {
    await this.repo.incrementUsage(storeId, field, amount);
  }

  async resetMonthlyUsage(storeId: string): Promise<void> {
    await this.repo.resetMonthlyUsage(storeId);
  }

  async checkPlanLimit(
    storeId: string,
    resource: keyof SubscriptionLimits
  ): Promise<void> {
    const subscription = await this.repo.findByStoreId(storeId);
    if (!subscription) {
      throw new NotFoundError("Subscription");
    }

    const limit = subscription.limits[resource];
    if (limit === -1) return;

    const usageMap: Record<string, keyof SubscriptionUsage> = {
      maxProducts: "products",
      maxCategories: "categories",
      maxInventory: "inventory",
      maxStaff: "staff",
      maxAiRequests: "aiRequests",
    };

    const usageField = usageMap[resource];
    if (usageField && (subscription.usage[usageField] as number) >= limit) {
      throw new BusinessRuleError(
        `You have reached the ${resource} limit (${limit}) for your ${subscription.plan} plan. Upgrade your plan to continue.`
      );
    }
  }

  async getBillingHistory(storeId: string): Promise<BillingRecord[]> {
    const subscription = await this.repo.findByStoreId(storeId);
    if (!subscription) {
      return [];
    }

    const records: BillingRecord[] = [];
    const startDate = new Date(subscription.startedAt);
    const now = new Date();

    let currentDate = startDate;
    let index = 0;

    while (currentDate < now) {
      const periodEnd = new Date(currentDate);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      records.push({
        id: `bill_${subscription._id}_${index}`,
        storeId,
        subscriptionId: subscription._id.toString(),
        plan: subscription.plan,
        amount: subscription.price,
        currency: subscription.currency,
        status: periodEnd < now ? "paid" : "pending",
        billingCycle: subscription.billingCycle,
        periodStart: currentDate.toISOString(),
        periodEnd: periodEnd.toISOString(),
        createdAt: currentDate.toISOString(),
      });

      currentDate = periodEnd;
      index++;
    }

    return records;
  }

  private getPlanLimits(plan: SubscriptionPlan): SubscriptionLimits {
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
    return {
      maxProducts: limits.maxProducts,
      maxCategories: limits.maxCategories,
      maxInventory: limits.maxInventory,
      maxStaff: limits.maxStaff,
      maxAiRequests: limits.maxAiRequests,
    };
  }

  private getPlanFeatures(plan: SubscriptionPlan): string[] {
    const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
    return [...limits.features];
  }
}

let instance: SubscriptionService | null = null;

export function getSubscriptionService(): SubscriptionService {
  if (!instance) {
    instance = new SubscriptionService();
  }
  return instance;
}
