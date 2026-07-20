import { getCategoryRepository } from "./category.repository.js";
import {
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryDocument,
  CategoryQueryParams,
} from "./category.types.js";
import {
  NotFoundError,
  ConflictError,
} from "../../utils/error-handler.js";
import { ACTIVITY_ACTION } from "../../constants/index.js";
import { getAuthRepository } from "../auth/auth.repository.js";
import { getSubscriptionService } from "../subscriptions/subscription.service.js";
import { generateSlug } from "../../utils/helpers.js";
import {
  parsePaginationParams,
  buildPaginationMeta,
  parseSortParams,
} from "../../utils/pagination.js";

export class CategoryService {
  private repository = getCategoryRepository();
  private authRepository = getAuthRepository();
  private subscriptionService = getSubscriptionService();

  async createCategory(
    storeId: string,
    userId: string,
    input: CreateCategoryInput
  ): Promise<CategoryDocument> {
    const slug = generateSlug(input.name);

    const existing = await this.repository.findByStoreIdAndSlug(storeId, slug);
    if (existing) {
      throw new ConflictError("A category with this name already exists.");
    }

    await this.subscriptionService.checkPlanLimit(storeId, "maxCategories");

    const now = new Date().toISOString();

    const category = await this.repository.create({
      storeId,
      name: input.name,
      slug,
      description: input.description,
      parentId: input.parentId,
      status: input.status || "active",
      sortOrder: input.sortOrder ?? 0,
      isDeleted: false,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.CREATE_CATEGORY,
      module: "categories",
      description: `Category "${input.name}" created.`,
      createdAt: now,
    });

    await this.subscriptionService.incrementUsage(storeId, "categories").catch(() => {});

    return category;
  }

  async getCategories(
    storeId: string,
    query: CategoryQueryParams
  ): Promise<{
    items: CategoryDocument[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const { page, limit, skip } = parsePaginationParams({
      page: query.page,
      limit: query.limit,
    });

    const sort = parseSortParams({
      sortBy: query.sortBy,
      order: query.order,
    });

    const { items, total } = await this.repository.findByStoreId(storeId, {
      skip,
      limit,
      search: query.search,
      status: query.status,
      sort,
    });

    const pagination = buildPaginationMeta(page, limit, total);

    return {
      items,
      total: pagination.totalItems,
      page: pagination.page,
      pageSize: pagination.limit,
      totalPages: pagination.totalPages,
    };
  }

  async getCategoryById(
    storeId: string,
    categoryId: string
  ): Promise<CategoryDocument> {
    const category = await this.repository.findByIdAndStoreId(
      categoryId,
      storeId
    );

    if (!category) {
      throw new NotFoundError("Category");
    }

    return category;
  }

  async updateCategory(
    storeId: string,
    userId: string,
    categoryId: string,
    input: UpdateCategoryInput
  ): Promise<CategoryDocument> {
    const existing = await this.repository.findByIdAndStoreId(
      categoryId,
      storeId
    );

    if (!existing) {
      throw new NotFoundError("Category");
    }

    const updateData: Record<string, unknown> = { ...input };

    if (input.name && input.name !== existing.name) {
      const slug = generateSlug(input.name);
      const slugConflict = await this.repository.findByStoreIdAndSlug(
        storeId,
        slug,
        categoryId
      );
      if (slugConflict) {
        throw new ConflictError("A category with this name already exists.");
      }
      updateData.slug = slug;
    }

    updateData.updatedBy = userId;

    const updated = await this.repository.update(
      categoryId,
      storeId,
      updateData as Partial<CategoryDocument>
    );

    if (!updated) {
      throw new NotFoundError("Category");
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.UPDATE_CATEGORY,
      module: "categories",
      description: `Category "${updated.name}" updated.`,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async deleteCategory(
    storeId: string,
    userId: string,
    categoryId: string
  ): Promise<void> {
    const category = await this.repository.findByIdAndStoreId(
      categoryId,
      storeId
    );

    if (!category) {
      throw new NotFoundError("Category");
    }

    await this.repository.softDelete(categoryId, storeId, userId);

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.DELETE_CATEGORY,
      module: "categories",
      description: `Category "${category.name}" deleted.`,
      createdAt: new Date().toISOString(),
    });
  }

  async countCategories(storeId: string): Promise<number> {
    return this.repository.countByStoreId(storeId);
  }
}

let categoryServiceInstance: CategoryService | null = null;

export function getCategoryService(): CategoryService {
  if (!categoryServiceInstance) {
    categoryServiceInstance = new CategoryService();
  }
  return categoryServiceInstance;
}
