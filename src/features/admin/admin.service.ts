import { getAdminRepository } from "./admin.repository.js";
import { getAuthRepository } from "../auth/auth.repository.js";
import {
  PlatformDashboard,
  AdminStore,
  AdminUser,
  AdminSubscription,
  ActivityLogItem,
  SystemStats,
  UpdateStoreStatusInput,
  UpdateUserStatusInput,
  UpdateSubscriptionInput,
  AdminQueryParams,
} from "./admin.types.js";
import { ACTIVITY_ACTION } from "../../constants/index.js";
import { NotFoundError, ValidationError } from "../../utils/error-handler.js";
import { parsePaginationParams } from "../../utils/pagination.js";

export class AdminService {
  private repo = getAdminRepository();
  private authRepo = getAuthRepository();

  async getDashboard(): Promise<PlatformDashboard> {
    return this.repo.getDashboard();
  }

  async getStores(params: AdminQueryParams): Promise<{
    items: AdminStore[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const { page, limit, skip } = parsePaginationParams({
      page: String(params.page || 1),
      limit: String(params.limit || 20),
    });

    const sort: Record<string, 1 | -1> = {};
    if (params.sortBy) {
      sort[params.sortBy] = params.order === "asc" ? 1 : -1;
    }

    const result = await this.repo.getStores({
      skip,
      limit,
      search: params.search,
      status: params.status,
      plan: params.plan,
      sort: Object.keys(sort).length > 0 ? sort : undefined,
    });

    return {
      ...result,
      page,
      pageSize: limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  async getStore(id: string): Promise<AdminStore> {
    const store = await this.repo.getStoreById(id);
    if (!store) throw new NotFoundError("Store not found.");
    return store;
  }

  async updateStoreStatus(
    id: string,
    input: UpdateStoreStatusInput,
    userId: string
  ): Promise<void> {
    const store = await this.repo.getStoreById(id);
    if (!store) throw new NotFoundError("Store not found.");

    const actionMap: Record<string, string> = {
      approved: ACTIVITY_ACTION.STORE_APPROVED,
      rejected: ACTIVITY_ACTION.STORE_REJECTED,
      suspended: ACTIVITY_ACTION.STORE_SUSPENDED || "STORE_SUSPENDED",
    };

    const isActive = input.status === "approved";
    await this.repo.updateStoreStatus(id, input.status, isActive);

    await this.authRepo.createActivityLog({
      storeId: id,
      userId,
      action: actionMap[input.status] || "STORE_STATUS_UPDATED",
      module: "admin",
      description: `Store "${store.storeName}" status changed to ${input.status}. ${input.reason || ""}`.trim(),
      createdAt: new Date().toISOString(),
    });
  }

  async getUsers(params: AdminQueryParams): Promise<{
    items: AdminUser[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const { page, limit, skip } = parsePaginationParams({
      page: String(params.page || 1),
      limit: String(params.limit || 20),
    });

    const sort: Record<string, 1 | -1> = {};
    if (params.sortBy) {
      sort[params.sortBy] = params.order === "asc" ? 1 : -1;
    }

    const result = await this.repo.getUsers({
      skip,
      limit,
      search: params.search,
      status: params.status,
      role: params.role,
      sort: Object.keys(sort).length > 0 ? sort : undefined,
    });

    return {
      ...result,
      page,
      pageSize: limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  async updateUserStatus(
    id: string,
    input: UpdateUserStatusInput,
    userId: string
  ): Promise<void> {
    await this.repo.updateUserStatus(id, input.status);

    const actionMap: Record<string, string> = {
      approved: "USER_APPROVED",
      rejected: "USER_REJECTED",
      suspended: "USER_SUSPENDED",
    };

    await this.authRepo.createActivityLog({
      userId,
      action: actionMap[input.status] || "USER_STATUS_UPDATED",
      module: "admin",
      description: `User status changed to ${input.status}. ${input.reason || ""}`.trim(),
      createdAt: new Date().toISOString(),
    });
  }

  async getSubscriptions(params: AdminQueryParams): Promise<{
    items: AdminSubscription[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const { page, limit, skip } = parsePaginationParams({
      page: String(params.page || 1),
      limit: String(params.limit || 20),
    });

    const sort: Record<string, 1 | -1> = {};
    if (params.sortBy) {
      sort[params.sortBy] = params.order === "asc" ? 1 : -1;
    }

    const result = await this.repo.getSubscriptions({
      skip,
      limit,
      search: params.search,
      status: params.status,
      plan: params.plan,
      sort: Object.keys(sort).length > 0 ? sort : undefined,
    });

    return {
      ...result,
      page,
      pageSize: limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  async updateSubscription(
    id: string,
    input: UpdateSubscriptionInput,
    userId: string
  ): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (input.plan) updates.plan = input.plan;
    if (input.status) updates.status = input.status;
    if (input.billingCycle) updates.billingCycle = input.billingCycle;

    if (Object.keys(updates).length === 0) {
      throw new ValidationError("Validation failed.", [
        { field: "updates", message: "At least one field must be provided." },
      ]);
    }

    await this.repo.updateSubscription(id, updates);

    await this.authRepo.createActivityLog({
      userId,
      action: "SUBSCRIPTION_UPDATED",
      module: "admin",
      description: `Subscription ${id} updated: ${Object.keys(updates).join(", ")}.`,
      createdAt: new Date().toISOString(),
    });
  }

  async getActivityLogs(params: {
    page?: number;
    limit?: number;
    storeId?: string;
    action?: string;
    module?: string;
  }): Promise<{
    items: ActivityLogItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const { page, limit, skip } = parsePaginationParams({
      page: String(params.page || 1),
      limit: String(params.limit || 20),
    });

    const result = await this.repo.getActivityLogs({
      skip,
      limit,
      storeId: params.storeId,
      action: params.action,
      module: params.module,
    });

    return {
      ...result,
      page,
      pageSize: limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  async getSystemStats(): Promise<SystemStats> {
    return this.repo.getSystemStats();
  }
}

let instance: AdminService | null = null;

export function getAdminService(): AdminService {
  if (!instance) {
    instance = new AdminService();
  }
  return instance;
}
