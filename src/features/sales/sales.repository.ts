import { Db, ObjectId, Filter } from "mongodb";
import { getDatabase } from "../../config/database";
import { COLLECTIONS } from "../../constants";
import { escapeRegex } from "../../utils/escape-regex";
import { SaleDocument } from "./sales.types";

export class SaleRepository {
  constructor(private db: Db) {}

  async create(sale: Omit<SaleDocument, "_id">): Promise<SaleDocument> {
    const result = await this.db
      .collection<SaleDocument>(COLLECTIONS.SALES)
      .insertOne(sale as SaleDocument);

    return { ...sale, _id: result.insertedId } as SaleDocument;
  }

  async findByStoreId(
    storeId: string,
    options?: {
      skip?: number;
      limit?: number;
      search?: string;
      status?: string;
      paymentStatus?: string;
      paymentMethod?: string;
      startDate?: string;
      endDate?: string;
      sort?: Record<string, 1 | -1>;
    }
  ): Promise<{ items: SaleDocument[]; total: number }> {
    const filter: Filter<SaleDocument> = {
      storeId,
      isDeleted: false,
    };

    if (options?.status) {
      filter.status = options.status;
    }

    if (options?.paymentStatus) {
      filter.paymentStatus = options.paymentStatus;
    }

    if (options?.paymentMethod) {
      filter.paymentMethod = options.paymentMethod;
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
        { customerPhone: searchRegex },
      ];
    }

    const collection = this.db.collection<SaleDocument>(COLLECTIONS.SALES);
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
    saleId: string,
    storeId: string
  ): Promise<SaleDocument | null> {
    return this.db
      .collection<SaleDocument>(COLLECTIONS.SALES)
      .findOne({
        _id: new ObjectId(saleId),
        storeId,
        isDeleted: false,
      });
  }

  async findByInvoiceNumber(
    storeId: string,
    invoiceNumber: string
  ): Promise<SaleDocument | null> {
    return this.db
      .collection<SaleDocument>(COLLECTIONS.SALES)
      .findOne({
        storeId,
        invoiceNumber,
        isDeleted: false,
      });
  }

  async update(
    saleId: string,
    storeId: string,
    update: Partial<Omit<SaleDocument, "_id" | "storeId" | "createdAt">>
  ): Promise<SaleDocument | null> {
    await this.db
      .collection<SaleDocument>(COLLECTIONS.SALES)
      .updateOne(
        { _id: new ObjectId(saleId), storeId, isDeleted: false },
        { $set: { ...update, updatedAt: new Date().toISOString() } }
      );

    return this.findByIdAndStoreId(saleId, storeId);
  }

  async softDelete(
    saleId: string,
    storeId: string,
    deletedBy: string
  ): Promise<void> {
    await this.db
      .collection<SaleDocument>(COLLECTIONS.SALES)
      .updateOne(
        { _id: new ObjectId(saleId), storeId, isDeleted: false },
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
      .collection<SaleDocument>(COLLECTIONS.SALES)
      .countDocuments({ storeId, isDeleted: false });
  }

  async getNextInvoiceNumber(storeId: string): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `INV-${dateStr}-`;

    const lastSale = await this.db
      .collection<SaleDocument>(COLLECTIONS.SALES)
      .findOne(
        { storeId, invoiceNumber: { $regex: `^${prefix}` } },
        { sort: { createdAt: -1 } }
      );

    let sequence = 1;
    if (lastSale && lastSale.invoiceNumber) {
      const lastSeq = parseInt(lastSale.invoiceNumber.split("-").pop() || "0", 10);
      sequence = lastSeq + 1;
    }

    return `${prefix}${String(sequence).padStart(4, "0")}`;
  }

  async getTodaySales(storeId: string): Promise<SaleDocument[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.db
      .collection<SaleDocument>(COLLECTIONS.SALES)
      .find({
        storeId,
        isDeleted: false,
        createdAt: {
          $gte: today.toISOString(),
          $lt: tomorrow.toISOString(),
        },
      })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async getSalesSummary(storeId: string): Promise<{
    totalSales: number;
    totalRevenue: number;
    totalPaid: number;
    totalDue: number;
    avgSaleValue: number;
  }> {
    const result = await this.db
      .collection<SaleDocument>(COLLECTIONS.SALES)
      .aggregate([
        { $match: { storeId, isDeleted: false } },
        {
          $group: {
            _id: null,
            totalSales: { $sum: 1 },
            totalRevenue: { $sum: "$grandTotal" },
            totalPaid: { $sum: "$paidAmount" },
            totalDue: { $sum: "$dueAmount" },
          },
        },
      ])
      .toArray();

    if (result.length === 0) {
      return { totalSales: 0, totalRevenue: 0, totalPaid: 0, totalDue: 0, avgSaleValue: 0 };
    }

    const summary = result[0];
    return {
      totalSales: summary.totalSales,
      totalRevenue: Math.round(summary.totalRevenue * 100) / 100,
      totalPaid: Math.round(summary.totalPaid * 100) / 100,
      totalDue: Math.round(summary.totalDue * 100) / 100,
      avgSaleValue: summary.totalSales > 0
        ? Math.round((summary.totalRevenue / summary.totalSales) * 100) / 100
        : 0,
    };
  }
}

let saleRepositoryInstance: SaleRepository | null = null;

export function getSaleRepository(): SaleRepository {
  if (!saleRepositoryInstance) {
    saleRepositoryInstance = new SaleRepository(getDatabase());
  }
  return saleRepositoryInstance;
}
