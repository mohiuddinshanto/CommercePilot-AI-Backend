import { Db, ObjectId } from "mongodb";
import { getDatabase } from "../../config/database.js";
import { COLLECTIONS } from "../../constants/index.js";
import { escapeRegex } from "../../utils/escape-regex.js";
import {
  PlatformDashboard,
  AdminStore,
  AdminUser,
  AdminSubscription,
  ActivityLogItem,
  SystemStats,
} from "./admin.types.js";

export class AdminRepository {
  constructor(private db: Db) {}

  async getDashboard(): Promise<PlatformDashboard> {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const [
      totalStores,
      totalUsers,
      totalProducts,
      totalSales,
      totalAiConversations,
      pendingStores,
      activeStores,
      suspendedStores,
      planBreakdownResult,
      recentActivity,
      salesData,
      monthlySalesData,
      totalSubscriptions,
      totalStaffCount,
    ] = await Promise.all([
      this.db.collection(COLLECTIONS.STORES).countDocuments(),
      this.db.collection(COLLECTIONS.USERS).countDocuments({ role: { $ne: "super_admin" } }),
      this.db.collection(COLLECTIONS.PRODUCTS).countDocuments(),
      this.db.collection(COLLECTIONS.SALES).countDocuments(),
      this.db.collection(COLLECTIONS.AI_CONVERSATIONS).countDocuments(),
      this.db.collection(COLLECTIONS.STORES).countDocuments({ accountStatus: "pending" }),
      this.db.collection(COLLECTIONS.STORES).countDocuments({ accountStatus: "approved" }),
      this.db.collection(COLLECTIONS.STORES).countDocuments({ accountStatus: "suspended" }),
      this.db.collection(COLLECTIONS.STORES).aggregate([
        { $group: { _id: "$plan", count: { $sum: 1 } } },
      ]).toArray(),
      this.db.collection(COLLECTIONS.ACTIVITY_LOGS)
        .find()
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray(),
      this.db.collection(COLLECTIONS.SALES)
        .aggregate([{ $group: { _id: null, totalRevenue: { $sum: "$grandTotal" } } }])
        .toArray(),
      this.db.collection(COLLECTIONS.SALES)
        .aggregate([
          { $match: { createdAt: { $gte: oneMonthAgo.toISOString() } } },
          { $group: { _id: null, monthlyRevenue: { $sum: "$grandTotal" } } },
        ])
        .toArray(),
      this.db.collection(COLLECTIONS.SUBSCRIPTIONS).countDocuments(),
      this.db.collection(COLLECTIONS.USERS).countDocuments({ role: "staff" }),
    ]);

    const planMap: PlatformDashboard["planBreakdown"] = { starter: 0, pro: 0, business: 0 };
    (planBreakdownResult as unknown as Array<{ _id: string; count: number }>).forEach((p) => {
      if (p._id in planMap) planMap[p._id as keyof PlatformDashboard["planBreakdown"]] = p.count;
    });

    const totalRevenue = salesData[0]?.totalRevenue || 0;
    const monthlyRevenue = monthlySalesData[0]?.monthlyRevenue || 0;

    return {
      totalStores,
      totalUsers,
      totalStaff: totalStaffCount,
      totalSubscriptions,
      totalRevenue,
      monthlyRevenue,
      totalAiConversations,
      totalSales,
      totalProducts,
      pendingStores,
      activeStores,
      suspendedStores,
      planBreakdown: planMap,
      recentActivity: recentActivity as unknown as ActivityLogItem[],
    };
  }

  async getStores(params: {
    skip: number;
    limit: number;
    search?: string;
    status?: string;
    plan?: string;
    sort?: Record<string, 1 | -1>;
  }): Promise<{ items: AdminStore[]; total: number }> {
    const filter: Record<string, unknown> = {};

    if (params.search) {
      const escapedSearch = escapeRegex(params.search);
      filter.$or = [
        { storeName: { $regex: escapedSearch, $options: "i" } },
        { storeSlug: { $regex: escapedSearch, $options: "i" } },
        { email: { $regex: escapedSearch, $options: "i" } },
      ];
    }
    if (params.status) filter.accountStatus = params.status;
    if (params.plan) filter.plan = params.plan;

    const total = await this.db
      .collection(COLLECTIONS.STORES)
      .countDocuments(filter);

    const stores = await this.db
      .collection(COLLECTIONS.STORES)
      .find(filter)
      .sort(params.sort || { createdAt: -1 })
      .skip(params.skip)
      .limit(params.limit)
      .toArray();

    const storeIds = stores.map((s) => s._id.toString());
    const ownerIds = stores.map((s) => s.ownerId);

    const owners = await this.db
      .collection(COLLECTIONS.USERS)
      .find({ _id: { $in: ownerIds.map((id) => new ObjectId(id)) } })
      .toArray();

    const ownerMap = new Map(owners.map((o) => [o._id.toString(), o]));

    const productCounts = await this.db
      .collection(COLLECTIONS.PRODUCTS)
      .aggregate([
        { $match: { storeId: { $in: storeIds }, isDeleted: { $ne: true } } },
        { $group: { _id: "$storeId", count: { $sum: 1 } } },
      ])
      .toArray();

    const productCountMap = new Map(
      (productCounts as unknown as Array<{ _id: string; count: number }>).map((p) => [p._id, p.count])
    );

    const staffCounts = await this.db
      .collection(COLLECTIONS.STAFF)
      .aggregate([
        { $match: { storeId: { $in: storeIds } } },
        { $group: { _id: "$storeId", count: { $sum: 1 } } },
      ])
      .toArray();

    const staffCountMap = new Map(
      (staffCounts as unknown as Array<{ _id: string; count: number }>).map((s) => [s._id, s.count])
    );

    const items: AdminStore[] = stores.map((store) => {
      const owner = ownerMap.get(store.ownerId);
      return {
        _id: store._id.toString(),
        ownerId: store.ownerId,
        storeName: store.storeName,
        storeSlug: store.storeSlug,
        logo: store.logo,
        phone: store.phone,
        email: store.email,
        address: store.address,
        currency: store.currency,
        timezone: store.timezone,
        plan: store.plan,
        accountStatus: store.accountStatus,
        isActive: store.isActive,
        ownerName: owner?.name,
        ownerEmail: owner?.email,
        productCount: productCountMap.get(store._id.toString()) || 0,
        staffCount: staffCountMap.get(store._id.toString()) || 0,
        createdAt: store.createdAt,
        updatedAt: store.updatedAt,
      };
    });

    return { items, total };
  }

  async getStoreById(storeId: string): Promise<AdminStore | null> {
    const store = await this.db
      .collection(COLLECTIONS.STORES)
      .findOne({ _id: new ObjectId(storeId) });

    if (!store) return null;

    const owner = await this.db
      .collection(COLLECTIONS.USERS)
      .findOne({ _id: new ObjectId(store.ownerId) });

    return {
      _id: store._id.toString(),
      ownerId: store.ownerId,
      storeName: store.storeName,
      storeSlug: store.storeSlug,
      logo: store.logo,
      phone: store.phone,
      email: store.email,
      address: store.address,
      currency: store.currency,
      timezone: store.timezone,
      plan: store.plan,
      accountStatus: store.accountStatus,
      isActive: store.isActive,
      ownerName: owner?.name,
      ownerEmail: owner?.email,
      createdAt: store.createdAt,
      updatedAt: store.updatedAt,
    };
  }

  async updateStoreStatus(
    storeId: string,
    status: string,
    isActive?: boolean
  ): Promise<void> {
    const update: Record<string, unknown> = {
      accountStatus: status,
      updatedAt: new Date().toISOString(),
    };
    if (isActive !== undefined) update.isActive = isActive;

    await this.db
      .collection(COLLECTIONS.STORES)
      .updateOne({ _id: new ObjectId(storeId) }, { $set: update });
  }

  async getUsers(params: {
    skip: number;
    limit: number;
    search?: string;
    status?: string;
    role?: string;
    sort?: Record<string, 1 | -1>;
  }): Promise<{ items: AdminUser[]; total: number }> {
    const filter: Record<string, unknown> = { role: { $ne: "super_admin" } };

    if (params.search) {
      const escapedSearch = escapeRegex(params.search);
      filter.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { email: { $regex: escapedSearch, $options: "i" } },
      ];
    }
    if (params.status) filter.accountStatus = params.status;
    if (params.role) filter.role = params.role;

    const total = await this.db
      .collection(COLLECTIONS.USERS)
      .countDocuments(filter);

    const users = await this.db
      .collection(COLLECTIONS.USERS)
      .find(filter)
      .sort(params.sort || { createdAt: -1 })
      .skip(params.skip)
      .limit(params.limit)
      .toArray();

    const storeIds = [...new Set(users.map((u) => u.storeId).filter(Boolean))];
    const stores = await this.db
      .collection(COLLECTIONS.STORES)
      .find({ _id: { $in: storeIds.map((id) => new ObjectId(id as string)) } })
      .toArray();

    const storeMap = new Map(stores.map((s) => [s._id.toString(), s]));

    const items: AdminUser[] = users.map((user) => ({
      _id: user._id.toString(),
      storeId: user.storeId,
      name: user.name,
      email: user.email,
      image: user.image,
      phone: user.phone,
      role: user.role,
      accountStatus: user.accountStatus,
      plan: user.plan,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      storeName: user.storeId ? storeMap.get(user.storeId)?.storeName : undefined,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    return { items, total };
  }

  async updateUserStatus(userId: string, status: string): Promise<void> {
    await this.db
      .collection(COLLECTIONS.USERS)
      .updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            accountStatus: status,
            isActive: status === "approved" || status === "suspended" ? status === "approved" : undefined,
            updatedAt: new Date().toISOString(),
          },
        }
      );
  }

  async getSubscriptions(params: {
    skip: number;
    limit: number;
    search?: string;
    status?: string;
    plan?: string;
    sort?: Record<string, 1 | -1>;
  }): Promise<{ items: AdminSubscription[]; total: number }> {
    const filter: Record<string, unknown> = {};

    if (params.status) filter.status = params.status;
    if (params.plan) filter.plan = params.plan;

    const total = await this.db
      .collection(COLLECTIONS.SUBSCRIPTIONS)
      .countDocuments(filter);

    const subs = await this.db
      .collection(COLLECTIONS.SUBSCRIPTIONS)
      .find(filter)
      .sort(params.sort || { createdAt: -1 })
      .skip(params.skip)
      .limit(params.limit)
      .toArray();

    const storeIds = [...new Set(subs.map((s) => s.storeId))];
    const stores = await this.db
      .collection(COLLECTIONS.STORES)
      .find({ _id: { $in: storeIds.map((id) => new ObjectId(id)) } })
      .toArray();

    const storeMap = new Map(stores.map((s) => [s._id.toString(), s.storeName]));

    let items: AdminSubscription[] = subs.map((sub) => ({
      _id: sub._id.toString(),
      storeId: sub.storeId,
      storeName: storeMap.get(sub.storeId),
      plan: sub.plan,
      status: sub.status,
      billingCycle: sub.billingCycle,
      price: sub.price,
      currency: sub.currency,
      startedAt: sub.startedAt,
      expiresAt: sub.expiresAt,
      renewalDate: sub.renewalDate,
      cancelledAt: sub.cancelledAt,
      isTrial: sub.isTrial,
      trialEndsAt: sub.trialEndsAt,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    }));

    if (params.search) {
      const searchLower = params.search.toLowerCase();
      items = items.filter(
        (item) =>
          item.storeName?.toLowerCase().includes(searchLower) ||
          item.plan.toLowerCase().includes(searchLower)
      );
    }

    return { items, total };
  }

  async updateSubscription(
    subscriptionId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    await this.db
      .collection(COLLECTIONS.SUBSCRIPTIONS)
      .updateOne(
        { _id: new ObjectId(subscriptionId) },
        { $set: { ...updates, updatedAt: new Date().toISOString() } }
      );
  }

  async getActivityLogs(params: {
    skip: number;
    limit: number;
    storeId?: string;
    action?: string;
    module?: string;
  }): Promise<{ items: ActivityLogItem[]; total: number }> {
    const filter: Record<string, unknown> = {};

    if (params.storeId) filter.storeId = params.storeId;
    if (params.action) filter.action = params.action;
    if (params.module) filter.module = params.module;

    const total = await this.db
      .collection(COLLECTIONS.ACTIVITY_LOGS)
      .countDocuments(filter);

    const logs = await this.db
      .collection(COLLECTIONS.ACTIVITY_LOGS)
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(params.skip)
      .limit(params.limit)
      .toArray();

    const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))];
    const users = await this.db
      .collection(COLLECTIONS.USERS)
      .find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } })
      .toArray();

    const userMap = new Map(users.map((u) => [u._id.toString(), u.name]));

    const items: ActivityLogItem[] = logs.map((log) => ({
      _id: log._id.toString(),
      storeId: log.storeId,
      userId: log.userId,
      userName: userMap.get(log.userId),
      action: log.action,
      module: log.module,
      description: log.description,
      ip: log.ip,
      device: log.device,
      createdAt: log.createdAt,
    }));

    return { items, total };
  }

  async getSystemStats(): Promise<SystemStats> {
    const collections = await this.db.listCollections().toArray();

    const countResults = await Promise.all(
      collections.map((col) =>
        this.db.collection(col.name).countDocuments()
      )
    );

    const collectionCounts: Record<string, number> = {};
    collections.forEach((col, i) => {
      collectionCounts[col.name] = countResults[i];
    });

    const totalDocuments = countResults.reduce((sum, count) => sum + count, 0);

    const dbStats = await this.db.command({ dbStats: 1 });

    return {
      totalCollections: collections.length,
      totalDocuments,
      collections: collectionCounts,
      dbSize: `${(dbStats.dataSize / (1024 * 1024)).toFixed(2)} MB`,
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
    };
  }
}

let instance: AdminRepository | null = null;

export function getAdminRepository(): AdminRepository {
  if (!instance) {
    instance = new AdminRepository(getDatabase());
  }
  return instance;
}
