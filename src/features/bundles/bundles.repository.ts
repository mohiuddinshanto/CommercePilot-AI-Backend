import { Db, ObjectId, Filter } from "mongodb";
import { getDatabase } from "../../config/database";
import { COLLECTIONS } from "../../constants";
import { escapeRegex } from "../../utils/escape-regex";
import { BundleDocument } from "./bundles.types";

export class BundleRepository {
  constructor(private db: Db) {}

  async create(bundle: Omit<BundleDocument, "_id">): Promise<BundleDocument> {
    const result = await this.db
      .collection<BundleDocument>(COLLECTIONS.BUNDLES)
      .insertOne(bundle as BundleDocument);

    return { ...bundle, _id: result.insertedId } as BundleDocument;
  }

  async findByStoreId(
    storeId: string,
    options?: {
      skip?: number;
      limit?: number;
      search?: string;
      status?: string;
      sort?: Record<string, 1 | -1>;
    }
  ): Promise<{ items: BundleDocument[]; total: number }> {
    const filter: Filter<BundleDocument> = {
      storeId,
      isDeleted: false,
    };

    if (options?.status) {
      filter.status = options.status;
    }

    if (options?.search) {
      const searchRegex = { $regex: escapeRegex(options.search), $options: "i" };
      filter.$or = [{ name: searchRegex }, { description: searchRegex }];
    }

    const collection = this.db.collection<BundleDocument>(COLLECTIONS.BUNDLES);
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
    bundleId: string,
    storeId: string
  ): Promise<BundleDocument | null> {
    return this.db
      .collection<BundleDocument>(COLLECTIONS.BUNDLES)
      .findOne({
        _id: new ObjectId(bundleId),
        storeId,
        isDeleted: false,
      });
  }

  async update(
    bundleId: string,
    storeId: string,
    update: Partial<Omit<BundleDocument, "_id" | "storeId" | "createdAt">>
  ): Promise<BundleDocument | null> {
    await this.db
      .collection<BundleDocument>(COLLECTIONS.BUNDLES)
      .updateOne(
        { _id: new ObjectId(bundleId), storeId, isDeleted: false },
        { $set: { ...update, updatedAt: new Date().toISOString() } }
      );

    return this.findByIdAndStoreId(bundleId, storeId);
  }

  async softDelete(
    bundleId: string,
    storeId: string,
    deletedBy: string
  ): Promise<void> {
    await this.db
      .collection<BundleDocument>(COLLECTIONS.BUNDLES)
      .updateOne(
        { _id: new ObjectId(bundleId), storeId, isDeleted: false },
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
      .collection<BundleDocument>(COLLECTIONS.BUNDLES)
      .countDocuments({ storeId, isDeleted: false });
  }

  async findByStoreIdBatch(
    bundleIds: string[],
    storeId: string
  ): Promise<BundleDocument[]> {
    if (bundleIds.length === 0) return [];
    return this.db
      .collection<BundleDocument>(COLLECTIONS.BUNDLES)
      .find({
        _id: { $in: bundleIds.map((id) => new ObjectId(id)) },
        storeId,
        isDeleted: false,
      })
      .toArray();
  }
}

let bundleRepositoryInstance: BundleRepository | null = null;

export function getBundleRepository(): BundleRepository {
  if (!bundleRepositoryInstance) {
    bundleRepositoryInstance = new BundleRepository(getDatabase());
  }
  return bundleRepositoryInstance;
}
