import { Db, ObjectId, Filter } from "mongodb";
import { getDatabase } from "../../config/database";
import { COLLECTIONS } from "../../constants";
import { escapeRegex } from "../../utils/escape-regex";
import { ProductDocument } from "./product.types";

export class ProductRepository {
  constructor(private db: Db) {}

  async create(
    product: Omit<ProductDocument, "_id">
  ): Promise<ProductDocument> {
    const result = await this.db
      .collection<ProductDocument>(COLLECTIONS.PRODUCTS)
      .insertOne(product as ProductDocument);

    return { ...product, _id: result.insertedId } as ProductDocument;
  }

  async findByStoreId(
    storeId: string,
    options?: {
      skip?: number;
      limit?: number;
      search?: string;
      status?: string;
      categoryId?: string;
      sort?: Record<string, 1 | -1>;
    }
  ): Promise<{ items: ProductDocument[]; total: number }> {
    const filter: Filter<ProductDocument> = {
      storeId,
      isDeleted: false,
    };

    if (options?.status) {
      filter.status = options.status;
    }

    if (options?.categoryId) {
      filter.categoryId = options.categoryId;
    }

    if (options?.search) {
      const searchRegex = { $regex: escapeRegex(options.search), $options: "i" };
      filter.$or = [
        { name: searchRegex },
        { sku: searchRegex },
        { barcode: searchRegex },
        { description: searchRegex },
      ];
    }

    const collection = this.db.collection<ProductDocument>(
      COLLECTIONS.PRODUCTS
    );

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
    productId: string,
    storeId: string
  ): Promise<ProductDocument | null> {
    return this.db
      .collection<ProductDocument>(COLLECTIONS.PRODUCTS)
      .findOne({
        _id: new ObjectId(productId),
        storeId,
        isDeleted: false,
      });
  }

  async update(
    productId: string,
    storeId: string,
    update: Partial<Omit<ProductDocument, "_id" | "storeId" | "createdAt">>
  ): Promise<ProductDocument | null> {
    await this.db
      .collection<ProductDocument>(COLLECTIONS.PRODUCTS)
      .updateOne(
        { _id: new ObjectId(productId), storeId, isDeleted: false },
        { $set: { ...update, updatedAt: new Date().toISOString() } }
      );

    return this.findByIdAndStoreId(productId, storeId);
  }

  async softDelete(
    productId: string,
    storeId: string,
    deletedBy: string
  ): Promise<void> {
    await this.db
      .collection<ProductDocument>(COLLECTIONS.PRODUCTS)
      .updateOne(
        { _id: new ObjectId(productId), storeId, isDeleted: false },
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

  async findByIds(
    productIds: string[],
    storeId: string
  ): Promise<ProductDocument[]> {
    const filter: Filter<ProductDocument> = {
      _id: { $in: productIds.map((id) => new ObjectId(id)) },
      storeId,
      isDeleted: false,
    };

    return this.db
      .collection<ProductDocument>(COLLECTIONS.PRODUCTS)
      .find(filter)
      .toArray();
  }

  async countByStoreId(storeId: string): Promise<number> {
    return this.db
      .collection<ProductDocument>(COLLECTIONS.PRODUCTS)
      .countDocuments({ storeId, isDeleted: false });
  }

  async countByStoreIdAndStatus(
    storeId: string,
    status: string
  ): Promise<number> {
    return this.db
      .collection<ProductDocument>(COLLECTIONS.PRODUCTS)
      .countDocuments({ storeId, status, isDeleted: false });
  }

  async findByStoreIdAndSku(
    storeId: string,
    sku: string,
    excludeId?: string
  ): Promise<ProductDocument | null> {
    const filter: Filter<ProductDocument> = {
      storeId,
      sku,
      isDeleted: false,
    };

    if (excludeId) {
      filter._id = { $ne: new ObjectId(excludeId) } as unknown as ObjectId;
    }

    return this.db
      .collection<ProductDocument>(COLLECTIONS.PRODUCTS)
      .findOne(filter);
  }

  async findByStoreIdAndSlug(
    storeId: string,
    slug: string
  ): Promise<ProductDocument | null> {
    return this.db
      .collection<ProductDocument>(COLLECTIONS.PRODUCTS)
      .findOne({ storeId, slug, isDeleted: false });
  }

  async getLowStockProducts(storeId: string): Promise<ProductDocument[]> {
    return this.db
      .collection<ProductDocument>(COLLECTIONS.PRODUCTS)
      .find({
        storeId,
        isDeleted: false,
        status: { $ne: "archived" },
        $expr: { $lte: ["$stock", "$lowStockLimit"] },
      })
      .sort({ stock: 1 })
      .toArray();
  }

  async getDeadStockProducts(
    storeId: string,
    days: number
  ): Promise<ProductDocument[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.db
      .collection<ProductDocument>(COLLECTIONS.PRODUCTS)
      .find({
        storeId,
        isDeleted: false,
        status: { $ne: "archived" },
        stock: { $gt: 0 },
        updatedAt: { $lt: cutoff.toISOString() },
      })
      .toArray();
  }
}

let productRepositoryInstance: ProductRepository | null = null;

export function getProductRepository(): ProductRepository {
  if (!productRepositoryInstance) {
    productRepositoryInstance = new ProductRepository(getDatabase());
  }
  return productRepositoryInstance;
}
