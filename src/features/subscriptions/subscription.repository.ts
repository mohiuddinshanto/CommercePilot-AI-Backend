import { Db } from "mongodb";
import { getDatabase } from "../../config/database.js";
import { COLLECTIONS } from "../../constants/index.js";
import {
  SubscriptionDocument,
  SubscriptionUsage,
} from "./subscription.types.js";

export class SubscriptionRepository {
  constructor(private db: Db) {}

  async findByStoreId(storeId: string): Promise<SubscriptionDocument | null> {
    return this.db
      .collection<SubscriptionDocument>(COLLECTIONS.SUBSCRIPTIONS)
      .findOne({ storeId });
  }

  async create(subscription: Omit<SubscriptionDocument, "_id">): Promise<SubscriptionDocument> {
    const result = await this.db
      .collection<SubscriptionDocument>(COLLECTIONS.SUBSCRIPTIONS)
      .insertOne(subscription as SubscriptionDocument);

    return { ...subscription, _id: result.insertedId } as SubscriptionDocument;
  }

  async update(storeId: string, updateData: Partial<SubscriptionDocument>): Promise<SubscriptionDocument | null> {
    const now = new Date().toISOString();
    await this.db
      .collection<SubscriptionDocument>(COLLECTIONS.SUBSCRIPTIONS)
      .updateOne(
        { storeId },
        { $set: { ...updateData, updatedAt: now } }
      );

    return this.findByStoreId(storeId);
  }

  async incrementUsage(storeId: string, field: keyof SubscriptionUsage, amount = 1): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .collection<SubscriptionDocument>(COLLECTIONS.SUBSCRIPTIONS)
      .updateOne(
        { storeId },
        {
          $inc: { [`usage.${field}`]: amount },
          $set: { updatedAt: now },
        }
      );
  }

  async resetMonthlyUsage(storeId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .collection<SubscriptionDocument>(COLLECTIONS.SUBSCRIPTIONS)
      .updateOne(
        { storeId },
        {
          $set: {
            "usage.aiRequests": 0,
            "usage.lastResetAt": now,
            updatedAt: now,
          },
        }
      );
  }

  async getUsage(storeId: string): Promise<SubscriptionUsage | null> {
    const sub = await this.findByStoreId(storeId);
    return sub?.usage || null;
  }
}

let instance: SubscriptionRepository | null = null;

export function getSubscriptionRepository(): SubscriptionRepository {
  if (!instance) {
    instance = new SubscriptionRepository(getDatabase());
  }
  return instance;
}
