import { ObjectId } from "mongodb";

export type SubscriptionPlan = "starter" | "pro" | "business";
export type SubscriptionStatus = "active" | "cancelled" | "expired" | "trialing";
export type BillingCycle = "monthly" | "yearly";

export interface SubscriptionLimits {
  maxProducts: number;
  maxCategories: number;
  maxInventory: number;
  maxStaff: number;
  maxAiRequests: number;
}

export interface SubscriptionUsage {
  products: number;
  categories: number;
  inventory: number;
  staff: number;
  aiRequests: number;
  lastResetAt: string;
}

export interface SubscriptionFeatures {
  features: string[];
}

export interface SubscriptionDocument {
  _id: ObjectId;
  storeId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  price: number;
  currency: string;
  startedAt: string;
  expiresAt: string;
  renewalDate: string;
  cancelledAt?: string;
  isTrial: boolean;
  trialEndsAt?: string;
  features: string[];
  limits: SubscriptionLimits;
  usage: SubscriptionUsage;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubscriptionInput {
  plan: SubscriptionPlan;
  billingCycle?: BillingCycle;
}

export interface UpgradePlanInput {
  plan: SubscriptionPlan;
  billingCycle?: BillingCycle;
}

export interface BillingRecord {
  id: string;
  storeId: string;
  subscriptionId: string;
  plan: SubscriptionPlan;
  amount: number;
  currency: string;
  status: "paid" | "pending" | "failed";
  billingCycle: BillingCycle;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export const PLAN_PRICES: Record<SubscriptionPlan, Record<BillingCycle, number>> = {
  starter: { monthly: 0, yearly: 0 },
  pro: { monthly: 29.99, yearly: 299.99 },
  business: { monthly: 79.99, yearly: 799.99 },
};
