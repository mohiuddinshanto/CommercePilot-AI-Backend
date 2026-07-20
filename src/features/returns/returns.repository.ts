import { Db, ObjectId, Filter, ClientSession } from "mongodb";
import { getDatabase } from "../../config/database.js";
import { COLLECTIONS } from "../../constants/index.js";
import { escapeRegex } from "../../utils/escape-regex.js";
import { ReturnDocument } from "./returns.types.js";

export class ReturnRepository {
  constructor(private db: Db) {}

  async create(returnDoc: Omit<ReturnDocument, "_id">, session?: ClientSession): Promise<ReturnDocument> {
    const result = await this.db
      .collection<ReturnDocument>(COLLECTIONS.RETURNS)
      .insertOne(returnDoc as ReturnDocument, { session });

    return { ...returnDoc, _id: result.insertedId } as ReturnDocument;
  }

  async findByStoreId(
    storeId: string,
    options?: {
      skip?: number;
      limit?: number;
      search?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      sort?: Record<string, 1 | -1>;
    }
  ): Promise<{ items: ReturnDocument[]; total: number }> {
    const filter: Filter<ReturnDocument> = {
      storeId,
      isDeleted: false,
    };

    if (options?.status) {
      filter.status = options.status;
    }

    if (options?.startDate || options?.endDate) {
      filter.createdAt = {};
      if (options.startDate) {
        (filter.createdAt as Record<string, string>)["$gte"] = options.startDate;
      }
      if (options.endDate) {
        (filter.createdAt as Record<string, string>)["$lte"] = options.endDate;
      }
    }

    if (options?.search) {
      const searchRegex = { $regex: escapeRegex(options.search), $options: "i" };
      filter.$or = [
        { invoiceNumber: searchRegex },
        { customerName: searchRegex },
        { reason: searchRegex },
      ];
    }

    const collection = this.db.collection<ReturnDocument>(COLLECTIONS.RETURNS);
    const total = await collection.countDocuments(filter);

    let cursor = collection.find(filter);

    if (options?.sort) {
      cursor = cursor.sort(options.sort);
    } else {
      cursor = cursor.sort({ createdAt: -1 });
    }

    if (options?.skip) {
      cursor = cursor.skip(options.skip);
    }

    if (options?.limit) {
      cursor = cursor.limit(options.limit);
    }

    const items = await cursor.toArray();
    return { items, total };
  }

  async findByIdAndStoreId(
    returnId: string,
    storeId: string
  ): Promise<ReturnDocument | null> {
    return this.db
      .collection<ReturnDocument>(COLLECTIONS.RETURNS)
      .findOne({
        _id: new ObjectId(returnId),
        storeId,
        isDeleted: false,
      });
  }

  async findBySaleId(
    storeId: string,
    saleId: string
  ): Promise<ReturnDocument[]> {
    return this.db
      .collection<ReturnDocument>(COLLECTIONS.RETURNS)
      .find({
        storeId,
        saleId: new ObjectId(saleId),
        isDeleted: false,
      })
      .toArray();
  }

  async update(
    returnId: string,
    storeId: string,
    update: Partial<Omit<ReturnDocument, "_id" | "storeId" | "createdAt">>
  ): Promise<ReturnDocument | null> {
    await this.db
      .collection<ReturnDocument>(COLLECTIONS.RETURNS)
      .updateOne(
        { _id: new ObjectId(returnId), storeId, isDeleted: false },
        { $set: { ...update, updatedAt: new Date().toISOString() } }
      );

    return this.findByIdAndStoreId(returnId, storeId);
  }

  async softDelete(
    returnId: string,
    storeId: string,
    deletedBy: string
  ): Promise<void> {
    await this.db
      .collection<ReturnDocument>(COLLECTIONS.RETURNS)
      .updateOne(
        { _id: new ObjectId(returnId), storeId, isDeleted: false },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            deletedBy,
            updatedAt: new Date().toISOString(),
          },
        }
      );
  }

  async countByStoreId(storeId: string): Promise<number> {
    return this.db
      .collection<ReturnDocument>(COLLECTIONS.RETURNS)
      .countDocuments({ storeId, isDeleted: false });
  }

  async findByInvoiceNumber(
    storeId: string,
    invoiceNumber: string
  ): Promise<ReturnDocument[]> {
    return this.db
      .collection<ReturnDocument>(COLLECTIONS.RETURNS)
      .find({ storeId, invoiceNumber, isDeleted: false })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async getReturnsSummary(storeId: string): Promise<{
    totalReturns: number;
    totalRefundAmount: number;
    pendingReturns: number;
    completedReturns: number;
  }> {
    const result = await this.db
      .collection<ReturnDocument>(COLLECTIONS.RETURNS)
      .aggregate([
        { $match: { storeId, isDeleted: false } },
        {
          $group: {
            _id: null,
            totalReturns: { $sum: 1 },
            totalRefundAmount: { $sum: "$refundAmount" },
            pendingReturns: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            completedReturns: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
            },
          },
        },
      ])
      .toArray();

    if (result.length === 0) {
      return {
        totalReturns: 0,
        totalRefundAmount: 0,
        pendingReturns: 0,
        completedReturns: 0,
      };
    }

    const summary = result[0];
    return {
      totalReturns: summary.totalReturns,
      totalRefundAmount: Math.round(summary.totalRefundAmount * 100) / 100,
      pendingReturns: summary.pendingReturns,
      completedReturns: summary.completedReturns,
    };
  }
}

let instance: ReturnRepository | null = null;

export function getReturnRepository(): ReturnRepository {
  if (!instance) {
    instance = new ReturnRepository(getDatabase());
  }
  return instance;
}
