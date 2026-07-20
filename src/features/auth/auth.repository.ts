import { Db, ObjectId } from "mongodb";
import { getDatabase } from "../../config/database.js";
import { COLLECTIONS } from "../../constants/index.js";
import { UserDocument, StoreDocument, ActivityLogDocument } from "./auth.types.js";

export class AuthRepository {
  constructor(private db: Db) {}

  async findUserByEmail(email: string): Promise<UserDocument | null> {
    return this.db
      .collection<UserDocument>(COLLECTIONS.USERS)
      .findOne({ email: email.toLowerCase() });
  }

  async findUserById(userId: string): Promise<UserDocument | null> {
    return this.db
      .collection<UserDocument>(COLLECTIONS.USERS)
      .findOne({ _id: new ObjectId(userId) });
  }

  async findStoreByOwnerId(ownerId: string): Promise<StoreDocument | null> {
    return this.db
      .collection<StoreDocument>(COLLECTIONS.STORES)
      .findOne({ ownerId });
  }

  async findStoreBySlug(slug: string): Promise<StoreDocument | null> {
    return this.db
      .collection<StoreDocument>(COLLECTIONS.STORES)
      .findOne({ storeSlug: slug.toLowerCase() });
  }

  async createStore(store: Omit<StoreDocument, "_id">): Promise<StoreDocument> {
    const result = await this.db
      .collection<StoreDocument>(COLLECTIONS.STORES)
      .insertOne(store as StoreDocument);

    return { ...store, _id: result.insertedId } as StoreDocument;
  }

  async updateUserStoreId(userId: string, storeId: string): Promise<void> {
    await this.db
      .collection<UserDocument>(COLLECTIONS.USERS)
      .updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            storeId,
            accountStatus: "approved",
            updatedAt: new Date().toISOString(),
          },
        }
      );
  }

  async updateUserAccountStatus(
    userId: string,
    status: string
  ): Promise<void> {
    await this.db
      .collection<UserDocument>(COLLECTIONS.USERS)
      .updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            accountStatus: status,
            updatedAt: new Date().toISOString(),
          },
        }
      );
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    await this.db
      .collection<UserDocument>(COLLECTIONS.USERS)
      .updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            lastLogin: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }
      );
  }

  async createActivityLog(log: Omit<ActivityLogDocument, "_id">): Promise<void> {
    await this.db
      .collection<ActivityLogDocument>(COLLECTIONS.ACTIVITY_LOGS)
      .insertOne(log as ActivityLogDocument);
  }

  async getStore(storeId: string): Promise<StoreDocument | null> {
    return this.db
      .collection<StoreDocument>(COLLECTIONS.STORES)
      .findOne({ _id: new ObjectId(storeId) });
  }

  async updateStoreAccountStatus(
    storeId: string,
    status: string
  ): Promise<void> {
    await this.db
      .collection<StoreDocument>(COLLECTIONS.STORES)
      .updateOne(
        { _id: new ObjectId(storeId) },
        {
          $set: {
            accountStatus: status,
            updatedAt: new Date().toISOString(),
          },
        }
      );
  }

  async isEmailTaken(email: string): Promise<boolean> {
    const user = await this.findUserByEmail(email);
    return user !== null;
  }

  async isStoreSlugTaken(slug: string): Promise<boolean> {
    const store = await this.findStoreBySlug(slug);
    return store !== null;
  }
}

let authRepositoryInstance: AuthRepository | null = null;

export function getAuthRepository(): AuthRepository {
  if (!authRepositoryInstance) {
    authRepositoryInstance = new AuthRepository(getDatabase());
  }
  return authRepositoryInstance;
}
