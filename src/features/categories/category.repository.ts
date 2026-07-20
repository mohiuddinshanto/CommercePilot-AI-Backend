import { Db, ObjectId, Filter } from "mongodb";
import { getDatabase } from "../../config/database.js";
import { COLLECTIONS } from "../../constants/index.js";
import { escapeRegex } from "../../utils/escape-regex.js";
import { CategoryDocument } from "./category.types.js";

export class CategoryRepository {
  constructor(private db: Db) {}

  async create(
    category: Omit<CategoryDocument, "_id">
  ): Promise<CategoryDocument> {
    const result = await this.db
      .collection<CategoryDocument>(COLLECTIONS.CATEGORIES)
      .insertOne(category as CategoryDocument);

    return { ...category, _id: result.insertedId } as CategoryDocument;
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
  ): Promise<{ items: CategoryDocument[]; total: number }> {
    const filter: Filter<CategoryDocument> = {
      storeId,
      isDeleted: false,
    };

    if (options?.status) {
      filter.status = options.status;
    }

    if (options?.search) {
      const searchRegex = { $regex: escapeRegex(options.search), $options: "i" };
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
      ];
    }

    const collection = this.db.collection<CategoryDocument>(
      COLLECTIONS.CATEGORIES
    );

    const total = await collection.countDocuments(filter);

    let cursor = collection.find(filter);

    if (options?.sort) {
      cursor = cursor.sort(options.sort);
    } else {
      cursor = cursor.sort({ sortOrder: 1, createdAt: -1 });
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
    categoryId: string,
    storeId: string
  ): Promise<CategoryDocument | null> {
    return this.db
      .collection<CategoryDocument>(COLLECTIONS.CATEGORIES)
      .findOne({
        _id: new ObjectId(categoryId),
        storeId,
        isDeleted: false,
      });
  }

  async update(
    categoryId: string,
    storeId: string,
    update: Partial<Omit<CategoryDocument, "_id" | "storeId" | "createdAt">>
  ): Promise<CategoryDocument | null> {
    await this.db
      .collection<CategoryDocument>(COLLECTIONS.CATEGORIES)
      .updateOne(
        { _id: new ObjectId(categoryId), storeId, isDeleted: false },
        { $set: { ...update, updatedAt: new Date().toISOString() } }
      );

    return this.findByIdAndStoreId(categoryId, storeId);
  }

  async softDelete(
    categoryId: string,
    storeId: string,
    deletedBy: string
  ): Promise<void> {
    await this.db
      .collection<CategoryDocument>(COLLECTIONS.CATEGORIES)
      .updateOne(
        { _id: new ObjectId(categoryId), storeId, isDeleted: false },
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
      .collection<CategoryDocument>(COLLECTIONS.CATEGORIES)
      .countDocuments({ storeId, isDeleted: false });
  }

  async findByStoreIdAndSlug(
    storeId: string,
    slug: string,
    excludeId?: string
  ): Promise<CategoryDocument | null> {
    const filter: Filter<CategoryDocument> = {
      storeId,
      slug,
      isDeleted: false,
    };

    if (excludeId) {
      filter._id = { $ne: new ObjectId(excludeId) } as unknown as ObjectId;
    }

    return this.db
      .collection<CategoryDocument>(COLLECTIONS.CATEGORIES)
      .findOne(filter);
  }
}

let categoryRepositoryInstance: CategoryRepository | null = null;

export function getCategoryRepository(): CategoryRepository {
  if (!categoryRepositoryInstance) {
    categoryRepositoryInstance = new CategoryRepository(getDatabase());
  }
  return categoryRepositoryInstance;
}
