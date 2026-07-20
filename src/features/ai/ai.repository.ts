import { Db, ObjectId } from "mongodb";
import { getDatabase } from "../../config/database";
import { COLLECTIONS } from "../../constants";
import { AIConversationDocument, AIMessage, StoreContextData } from "./ai.types";

export class AIRepository {
  constructor(private db: Db) {}

  async createConversation(
    storeId: string,
    userId: string,
    title: string,
    model: string,
    firstMessage: AIMessage,
    assistantMessage: AIMessage
  ): Promise<AIConversationDocument> {
    const now = new Date().toISOString();
    const doc: Omit<AIConversationDocument, "_id"> = {
      storeId,
      userId,
      title,
      messages: [firstMessage, assistantMessage],
      model,
      totalTokens: 0,
      messageCount: 2,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this.db
      .collection<AIConversationDocument>(COLLECTIONS.AI_CONVERSATIONS)
      .insertOne(doc as AIConversationDocument);

    return { ...doc, _id: result.insertedId } as AIConversationDocument;
  }

  async getConversations(
    storeId: string,
    userId: string,
    page: number,
    limit: number
  ): Promise<{ conversations: AIConversationDocument[]; total: number }> {
    const collection = this.db.collection<AIConversationDocument>(COLLECTIONS.AI_CONVERSATIONS);
    const filter = { storeId, userId, isDeleted: false };
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);

    return { conversations, total };
  }

  async getConversationById(
    conversationId: string,
    storeId: string,
    userId: string
  ): Promise<AIConversationDocument | null> {
    return this.db
      .collection<AIConversationDocument>(COLLECTIONS.AI_CONVERSATIONS)
      .findOne({
        _id: new ObjectId(conversationId),
        storeId,
        userId,
        isDeleted: false,
      });
  }

  async addMessage(
    conversationId: string,
    userMessage: AIMessage,
    assistantMessage: AIMessage,
    tokensUsed: number
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .collection<AIConversationDocument>(COLLECTIONS.AI_CONVERSATIONS)
      .updateOne(
        { _id: new ObjectId(conversationId) },
        {
          $push: {
            messages: { $each: [userMessage, assistantMessage] },
          },
          $inc: {
            totalTokens: tokensUsed,
            messageCount: 2,
          },
          $set: {
            updatedAt: now,
          },
        }
      );
  }

  async updateTitle(conversationId: string, title: string): Promise<void> {
    await this.db
      .collection<AIConversationDocument>(COLLECTIONS.AI_CONVERSATIONS)
      .updateOne(
        { _id: new ObjectId(conversationId) },
        { $set: { title, updatedAt: new Date().toISOString() } }
      );
  }

  async deleteConversation(
    conversationId: string,
    storeId: string,
    userId: string
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db
      .collection<AIConversationDocument>(COLLECTIONS.AI_CONVERSATIONS)
      .updateOne(
        {
          _id: new ObjectId(conversationId),
          storeId,
          userId,
          isDeleted: false,
        },
        {
          $set: {
            isDeleted: true,
            deletedAt: now,
            updatedAt: now,
          },
        }
      );

    return result.modifiedCount > 0;
  }

  async countByStoreAndUser(storeId: string, userId: string): Promise<number> {
    const result = await this.db
      .collection<AIConversationDocument>(COLLECTIONS.AI_CONVERSATIONS)
      .aggregate([
        { $match: { storeId, userId, isDeleted: false } },
        { $unwind: "$messages" },
        { $match: { "messages.role": "user" } },
        { $count: "total" },
      ])
      .toArray();

    return result.length > 0 ? result[0].total : 0;
  }

  async getTotalTokensByStoreAndUser(storeId: string, userId: string): Promise<number> {
    const result = await this.db
      .collection<AIConversationDocument>(COLLECTIONS.AI_CONVERSATIONS)
      .aggregate([
        { $match: { storeId, userId, isDeleted: false } },
        { $group: { _id: null, total: { $sum: "$totalTokens" } } },
      ])
      .toArray();

    return result.length > 0 ? result[0].total : 0;
  }

  async getStoreContext(storeId: string, dateRanges: {
    today: { start: Date; end: Date };
    weekStart: Date;
    monthStart: Date;
  }): Promise<StoreContextData> {
    const storeCollection = this.db.collection(COLLECTIONS.STORES);
    const productCollection = this.db.collection(COLLECTIONS.PRODUCTS);
    const categoryCollection = this.db.collection(COLLECTIONS.CATEGORIES);
    const inventoryCollection = this.db.collection(COLLECTIONS.INVENTORY);
    const salesCollection = this.db.collection(COLLECTIONS.SALES);
    const staffCollection = this.db.collection(COLLECTIONS.STAFF);

    const store = await storeCollection.findOne({ _id: new ObjectId(storeId) });

    const [
      totalProducts,
      activeProducts,
      lowStockProducts,
      outOfStockProducts,
      topProducts,
      totalCategories,
      topCategories,
      inventoryAgg,
      todaySales,
      weekSales,
      monthSales,
      totalSalesAgg,
      todayCount,
      monthCount,
      paymentMethodAgg,
      totalStaff,
      activeStaff,
    ] = await Promise.all([
      productCollection.countDocuments({ storeId, isDeleted: false }),
      productCollection.countDocuments({ storeId, isDeleted: false, status: "active" }),
      productCollection.countDocuments({ storeId, isDeleted: false, $expr: { $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$lowStockLimit"] }] } }),
      productCollection.countDocuments({ storeId, isDeleted: false, stock: 0 }),
      productCollection.find({ storeId, isDeleted: false }).sort({ sellingPrice: -1 }).limit(5).toArray(),
      categoryCollection.countDocuments({ storeId, isDeleted: false }),
      categoryCollection.find({ storeId, isDeleted: false }).sort({ name: 1 }).limit(5).toArray(),
      inventoryCollection.aggregate([
        { $match: { storeId: new ObjectId(storeId), deletedAt: null } },
        { $group: { _id: null, totalStock: { $sum: "$currentStock" }, totalValue: { $sum: { $multiply: ["$currentStock", "$costPrice"] } }, lowStock: { $sum: { $cond: [{ $and: [{ $gt: ["$currentStock", 0] }, { $lte: ["$currentStock", "$lowStockLimit"] }] }, 1, 0] } }, outOfStock: { $sum: { $cond: [{ $eq: ["$currentStock", 0] }, 1, 0] } } } },
      ]).toArray(),
      salesCollection.aggregate([
        { $match: { storeId, isDeleted: false, createdAt: { $gte: dateRanges.today.start.toISOString(), $lte: dateRanges.today.end.toISOString() } } },
        { $group: { _id: null, revenue: { $sum: "$grandTotal" } } },
      ]).toArray(),
      salesCollection.aggregate([
        { $match: { storeId, isDeleted: false, createdAt: { $gte: dateRanges.weekStart.toISOString(), $lte: dateRanges.today.end.toISOString() } } },
        { $group: { _id: null, revenue: { $sum: "$grandTotal" } } },
      ]).toArray(),
      salesCollection.aggregate([
        { $match: { storeId, isDeleted: false, createdAt: { $gte: dateRanges.monthStart.toISOString(), $lte: dateRanges.today.end.toISOString() } } },
        { $group: { _id: null, revenue: { $sum: "$grandTotal" } } },
      ]).toArray(),
      salesCollection.aggregate([
        { $match: { storeId, isDeleted: false } },
        { $group: { _id: null, total: { $sum: "$grandTotal" } } },
      ]).toArray(),
      salesCollection.countDocuments({ storeId, isDeleted: false, createdAt: { $gte: dateRanges.today.start.toISOString(), $lte: dateRanges.today.end.toISOString() } }),
      salesCollection.countDocuments({ storeId, isDeleted: false, createdAt: { $gte: dateRanges.monthStart.toISOString(), $lte: dateRanges.today.end.toISOString() } }),
      salesCollection.aggregate([
        { $match: { storeId, isDeleted: false } },
        { $group: { _id: "$paymentMethod", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]).toArray(),
      staffCollection.countDocuments({ storeId, status: { $in: ["active", "pending"] } }),
      staffCollection.countDocuments({ storeId, status: "active" }),
    ]);

    return {
      store: store as StoreContextData["store"],
      productStats: { totalProducts, activeProducts, lowStockProducts, outOfStockProducts, topProducts: topProducts as unknown as StoreContextData["productStats"]["topProducts"] },
      categoryStats: { totalCategories, topCategories: topCategories as unknown as StoreContextData["categoryStats"]["topCategories"] },
      inventoryStats: (inventoryAgg[0] as StoreContextData["inventoryStats"]) || { totalStock: 0, totalValue: 0, lowStock: 0, outOfStock: 0 },
      salesStats: {
        todaySales: todaySales as StoreContextData["salesStats"]["todaySales"],
        weekSales: weekSales as StoreContextData["salesStats"]["weekSales"],
        monthSales: monthSales as StoreContextData["salesStats"]["monthSales"],
        totalSalesAgg: totalSalesAgg as StoreContextData["salesStats"]["totalSalesAgg"],
        todayCount,
        monthCount,
        paymentMethodAgg: paymentMethodAgg as StoreContextData["salesStats"]["paymentMethodAgg"],
      },
      staffStats: { totalStaff, activeStaff },
    };
  }
}

let instance: AIRepository | null = null;

export function getAIRepository(): AIRepository {
  if (!instance) {
    instance = new AIRepository(getDatabase());
  }
  return instance;
}
