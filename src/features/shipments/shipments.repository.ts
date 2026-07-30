import { Db, ObjectId, Filter, ClientSession } from "mongodb";
import { getDatabase } from "../../config/database.js";
import { COLLECTIONS } from "../../constants/index.js";
import { ShipmentDocument } from "./shipments.types.js";

export class ShipmentRepository {
  constructor(private db: Db) {}

  async create(data: Omit<ShipmentDocument, "_id">, session?: ClientSession): Promise<ShipmentDocument> {
    const result = await this.db
      .collection<ShipmentDocument>(COLLECTIONS.SHIPMENTS)
      .insertOne(data as ShipmentDocument, { session });
    return { ...data, _id: result.insertedId } as ShipmentDocument;
  }

  async findByStoreId(
    storeId: string,
    options?: {
      skip?: number;
      limit?: number;
      saleId?: string;
      status?: string;
      courier?: string;
      sort?: Record<string, 1 | -1>;
    }
  ): Promise<{ items: ShipmentDocument[]; total: number }> {
    const filter: Filter<ShipmentDocument> = { storeId, isDeleted: false };

    if (options?.saleId) filter.saleId = new ObjectId(options.saleId);
    if (options?.status) filter.status = options.status;
    if (options?.courier) filter.courier = options.courier;

    const collection = this.db.collection<ShipmentDocument>(COLLECTIONS.SHIPMENTS);
    const total = await collection.countDocuments(filter);

    let cursor = collection.find(filter);
    cursor = cursor.sort(options?.sort || { createdAt: -1 });

    if (options?.skip) cursor = cursor.skip(options.skip);
    if (options?.limit) cursor = cursor.limit(options.limit);

    const items = await cursor.toArray();
    return { items, total };
  }

  async findByIdAndStoreId(shipmentId: string, storeId: string): Promise<ShipmentDocument | null> {
    return this.db
      .collection<ShipmentDocument>(COLLECTIONS.SHIPMENTS)
      .findOne({ _id: new ObjectId(shipmentId), storeId, isDeleted: false });
  }

  async findBySaleId(storeId: string, saleId: string): Promise<ShipmentDocument[]> {
    return this.db
      .collection<ShipmentDocument>(COLLECTIONS.SHIPMENTS)
      .find({ storeId, saleId: new ObjectId(saleId), isDeleted: false })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async update(
    shipmentId: string,
    storeId: string,
    update: Partial<Omit<ShipmentDocument, "_id" | "storeId" | "createdAt">>
  ): Promise<ShipmentDocument | null> {
    await this.db
      .collection<ShipmentDocument>(COLLECTIONS.SHIPMENTS)
      .updateOne(
        { _id: new ObjectId(shipmentId), storeId, isDeleted: false },
        { $set: { ...update, updatedAt: new Date().toISOString() } }
      );
    return this.findByIdAndStoreId(shipmentId, storeId);
  }

  async softDelete(shipmentId: string, storeId: string, deletedBy: string): Promise<void> {
    await this.db
      .collection<ShipmentDocument>(COLLECTIONS.SHIPMENTS)
      .updateOne(
        { _id: new ObjectId(shipmentId), storeId, isDeleted: false },
        { $set: { isDeleted: true, deletedAt: new Date().toISOString(), deletedBy, updatedAt: new Date().toISOString() } }
      );
  }

  async updateStatus(shipmentId: string, storeId: string, status: string): Promise<ShipmentDocument | null> {
    await this.db
      .collection<ShipmentDocument>(COLLECTIONS.SHIPMENTS)
      .updateOne(
        { _id: new ObjectId(shipmentId), storeId, isDeleted: false },
        {
          $set: { status, updatedAt: new Date().toISOString() },
          $push: { statusHistory: { status, timestamp: new Date() } as any },
        }
      );
    return this.findByIdAndStoreId(shipmentId, storeId);
  }
}

let instance: ShipmentRepository | null = null;

export function getShipmentRepository(): ShipmentRepository {
  if (!instance) {
    instance = new ShipmentRepository(getDatabase());
  }
  return instance;
}
