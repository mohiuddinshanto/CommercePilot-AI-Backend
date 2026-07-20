import { Db, ObjectId, Filter } from "mongodb";
import { getDatabase } from "../../config/database.js";
import { COLLECTIONS } from "../../constants/index.js";
import { escapeRegex } from "../../utils/escape-regex.js";
import { StaffMemberDocument } from "./staff.types.js";

export class StaffRepository {
  constructor(private db: Db) {}

  async findByStoreId(
    storeId: string,
    options?: {
      skip?: number;
      limit?: number;
      search?: string;
      status?: string;
      role?: string;
      sort?: Record<string, 1 | -1>;
    }
  ): Promise<{ items: StaffMemberDocument[]; total: number }> {
    const filter: Filter<StaffMemberDocument> = { storeId, isDeleted: false };

    if (options?.status) {
      filter.status = options.status as StaffMemberDocument["status"];
    }

    if (options?.role) {
      filter.role = options.role;
    }

    if (options?.search) {
      const searchRegex = { $regex: escapeRegex(options.search), $options: "i" };
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { role: searchRegex },
      ];
    }

    const collection = this.db.collection<StaffMemberDocument>(COLLECTIONS.STAFF);
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

  async findById(staffId: string): Promise<StaffMemberDocument | null> {
    return this.db
      .collection<StaffMemberDocument>(COLLECTIONS.STAFF)
      .findOne({ _id: new ObjectId(staffId) });
  }

  async findByIdAndStoreId(
    staffId: string,
    storeId: string
  ): Promise<StaffMemberDocument | null> {
    return this.db
      .collection<StaffMemberDocument>(COLLECTIONS.STAFF)
      .findOne({ _id: new ObjectId(staffId), storeId, isDeleted: false });
  }

  async findByUserId(
    storeId: string,
    userId: string
  ): Promise<StaffMemberDocument | null> {
    return this.db
      .collection<StaffMemberDocument>(COLLECTIONS.STAFF)
      .findOne({ storeId, userId, status: "active", isDeleted: false });
  }

  async findByEmailAndStoreId(
    email: string,
    storeId: string
  ): Promise<StaffMemberDocument | null> {
    return this.db
      .collection<StaffMemberDocument>(COLLECTIONS.STAFF)
      .findOne({ email: email.toLowerCase(), storeId, isDeleted: false });
  }

  async findByInvitationToken(
    token: string
  ): Promise<StaffMemberDocument | null> {
    return this.db
      .collection<StaffMemberDocument>(COLLECTIONS.STAFF)
      .findOne({ invitationToken: token, status: "pending", isDeleted: false });
  }

  async create(
    staff: Omit<StaffMemberDocument, "_id">
  ): Promise<StaffMemberDocument> {
    const result = await this.db
      .collection<StaffMemberDocument>(COLLECTIONS.STAFF)
      .insertOne(staff as StaffMemberDocument);

    return { ...staff, _id: result.insertedId } as StaffMemberDocument;
  }

  async update(
    staffId: string,
    storeId: string,
    update: Partial<Omit<StaffMemberDocument, "_id" | "storeId" | "createdAt">>
  ): Promise<StaffMemberDocument | null> {
    await this.db
      .collection<StaffMemberDocument>(COLLECTIONS.STAFF)
      .updateOne(
        { _id: new ObjectId(staffId), storeId },
        { $set: { ...update, updatedAt: new Date().toISOString() } }
      );

    return this.findByIdAndStoreId(staffId, storeId);
  }

  async delete(staffId: string, storeId: string, deletedBy: string): Promise<void> {
    await this.db
      .collection<StaffMemberDocument>(COLLECTIONS.STAFF)
      .updateOne(
        { _id: new ObjectId(staffId), storeId },
        { $set: { isDeleted: true, deletedAt: new Date().toISOString(), deletedBy, updatedAt: new Date().toISOString() } }
      );
  }

  async countByStoreId(storeId: string): Promise<number> {
    return this.db
      .collection<StaffMemberDocument>(COLLECTIONS.STAFF)
      .countDocuments({ storeId, isDeleted: false });
  }
}

let staffRepositoryInstance: StaffRepository | null = null;

export function getStaffRepository(): StaffRepository {
  if (!staffRepositoryInstance) {
    staffRepositoryInstance = new StaffRepository(getDatabase());
  }
  return staffRepositoryInstance;
}
