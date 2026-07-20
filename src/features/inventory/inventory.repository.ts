import { ObjectId, Collection, Filter, UpdateFilter, Db } from "mongodb";
import { getDatabase } from "../../config/database.js";
import { COLLECTIONS } from "../../constants/index.js";
import { InventoryDocument, InventoryMovementDocument } from "./inventory.types.js";

export class InventoryRepository {
  constructor(private db: Db) {}

  private collection(): Collection<InventoryDocument> {
    return this.db.collection<InventoryDocument>(COLLECTIONS.INVENTORY);
  }

  private movementCollection(): Collection<InventoryMovementDocument> {
    return this.db.collection<InventoryMovementDocument>(COLLECTIONS.INVENTORY_MOVEMENTS);
  }

  async findByStoreId(
    storeId: ObjectId,
    filter: Filter<InventoryDocument> = {},
    options?: { skip?: number; limit?: number }
  ): Promise<InventoryDocument[]> {
    let cursor = this.collection()
      .find({ storeId, deletedAt: null, ...filter })
      .sort({ createdAt: -1 });

    if (options?.skip) cursor = cursor.skip(options.skip);
    if (options?.limit) cursor = cursor.limit(options.limit);

    return cursor.toArray();
  }

  async findByIdAndStoreId(storeId: ObjectId, id: ObjectId): Promise<InventoryDocument | null> {
    return this.collection().findOne({
      _id: id,
      storeId,
      deletedAt: null,
    });
  }

  async findByProductIdAndStoreId(storeId: ObjectId, productId: ObjectId): Promise<InventoryDocument | null> {
    return this.collection().findOne({
      storeId,
      productId,
      deletedAt: null,
    });
  }

  async create(data: Omit<InventoryDocument, "_id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<InventoryDocument> {
    const now = new Date();
    const doc: InventoryDocument = {
      _id: new ObjectId(),
      ...data,
      reservedStock: data.reservedStock ?? 0,
      availableStock: (data.currentStock ?? 0) - (data.reservedStock ?? 0),
      lastRestockedAt: null,
      lastSoldAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await this.collection().insertOne(doc);
    return doc;
  }

  async update(id: ObjectId, storeId: ObjectId, update: UpdateFilter<InventoryDocument>): Promise<InventoryDocument | null> {
    const result = await this.collection().findOneAndUpdate(
      { _id: id, storeId, deletedAt: null },
      { ...update, $set: { ...(update.$set as object), updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    return result;
  }

  async softDelete(id: ObjectId, storeId: ObjectId): Promise<boolean> {
    const result = await this.collection().updateOne(
      { _id: id, storeId, deletedAt: null },
      { $set: { deletedAt: new Date(), updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  async countByStoreId(storeId: ObjectId, filter: Filter<InventoryDocument> = {}): Promise<number> {
    return this.collection().countDocuments({ storeId, deletedAt: null, ...filter });
  }

  async getLowStock(storeId: ObjectId): Promise<InventoryDocument[]> {
    return this.collection()
      .find({
        storeId,
        deletedAt: null,
        $expr: { $lte: ["$currentStock", "$lowStockLimit"] },
      })
      .toArray();
  }

  async getOutOfStock(storeId: ObjectId): Promise<InventoryDocument[]> {
    return this.collection()
      .find({
        storeId,
        deletedAt: null,
        currentStock: 0,
      })
      .toArray();
  }

  async createMovement(data: Omit<InventoryMovementDocument, "_id" | "createdAt">): Promise<InventoryMovementDocument> {
    const doc: InventoryMovementDocument = {
      _id: new ObjectId(),
      ...data,
      createdAt: new Date(),
    };
    await this.movementCollection().insertOne(doc);
    return doc;
  }

  async findMovements(storeId: ObjectId, filter: Filter<InventoryMovementDocument> = {}): Promise<InventoryMovementDocument[]> {
    return this.movementCollection()
      .find({ storeId, ...filter })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async findByProductIds(storeId: ObjectId, productIds: ObjectId[]): Promise<InventoryDocument[]> {
    if (productIds.length === 0) return [];
    return this.collection()
      .find({
        storeId,
        productId: { $in: productIds },
        deletedAt: null,
      })
      .toArray();
  }

  async countMovementsByStoreId(storeId: ObjectId): Promise<number> {
    return this.movementCollection().countDocuments({ storeId });
  }
}

let instance: InventoryRepository | null = null;

export function getInventoryRepository(): InventoryRepository {
  if (!instance) {
    instance = new InventoryRepository(getDatabase());
  }
  return instance;
}
