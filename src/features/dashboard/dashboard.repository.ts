import { Db } from "mongodb";
import { getDatabase } from "../../config/database.js";
import { COLLECTIONS } from "../../constants/index.js";
import { ActivityLogDocument } from "../auth/auth.types.js";

export class DashboardRepository {
  constructor(private db: Db) {}

  async getRecentActivities(
    storeId: string,
    limit: number = 10,
    page: number = 1
  ): Promise<{ items: ActivityLogDocument[]; total: number }> {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.db
        .collection<ActivityLogDocument>(COLLECTIONS.ACTIVITY_LOGS)
        .find({ storeId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      this.db
        .collection<ActivityLogDocument>(COLLECTIONS.ACTIVITY_LOGS)
        .countDocuments({ storeId }),
    ]);

    return { items, total };
  }
}

let repositoryInstance: DashboardRepository | null = null;

export function getDashboardRepository(): DashboardRepository {
  if (!repositoryInstance) {
    repositoryInstance = new DashboardRepository(getDatabase());
  }
  return repositoryInstance;
}
