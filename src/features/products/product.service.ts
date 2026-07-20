import { getProductRepository } from "./product.repository";
import {
  CreateProductInput,
  UpdateProductInput,
  ProductDocument,
  ProductQueryParams,
} from "./product.types";
import {
  NotFoundError,
  ConflictError,
  BusinessRuleError,
} from "../../utils/error-handler";
import { ACTIVITY_ACTION } from "../../constants";
import { getAuthRepository } from "../auth/auth.repository";
import { getSubscriptionService } from "../subscriptions/subscription.service";
import { generateSlug } from "../../utils/helpers";
import {
  parsePaginationParams,
  buildPaginationMeta,
  parseSortParams,
} from "../../utils/pagination";

export class ProductService {
  private repository = getProductRepository();
  private authRepository = getAuthRepository();
  private subscriptionService = getSubscriptionService();

  async createProduct(
    storeId: string,
    userId: string,
    input: CreateProductInput
  ): Promise<ProductDocument> {
    const existing = await this.repository.findByStoreIdAndSku(
      storeId,
      input.sku
    );

    if (existing) {
      throw new ConflictError("A product with this SKU already exists.");
    }

    await this.subscriptionService.checkPlanLimit(storeId, "maxProducts");

    const slug = generateSlug(input.name);
    const now = new Date().toISOString();

    const product = await this.repository.create({
      storeId,
      categoryId: input.categoryId,
      sku: input.sku,
      barcode: input.barcode,
      name: input.name,
      slug,
      description: input.description,
      images: input.images || [],
      costPrice: input.costPrice,
      sellingPrice: input.sellingPrice,
      discountPrice: input.discountPrice,
      stock: input.stock,
      lowStockLimit: input.lowStockLimit ?? 10,
      status: input.status || "active",
      tags: input.tags || [],
      isDeleted: false,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.CREATE_PRODUCT,
      module: "products",
      description: `Product "${input.name}" created.`,
      createdAt: now,
    });

    await this.subscriptionService.incrementUsage(storeId, "products").catch(() => {});

    return product;
  }

  async getProducts(
    storeId: string,
    query: ProductQueryParams
  ): Promise<{
    items: ProductDocument[];
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
      categoryId: query.categoryId,
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

  async getProductById(
    storeId: string,
    productId: string
  ): Promise<ProductDocument> {
    const product = await this.repository.findByIdAndStoreId(
      productId,
      storeId
    );

    if (!product) {
      throw new NotFoundError("Product");
    }

    return product;
  }

  async updateProduct(
    storeId: string,
    userId: string,
    productId: string,
    input: UpdateProductInput
  ): Promise<ProductDocument> {
    const existing = await this.repository.findByIdAndStoreId(
      productId,
      storeId
    );

    if (!existing) {
      throw new NotFoundError("Product");
    }

    if (input.sku) {
      const skuConflict = await this.repository.findByStoreIdAndSku(
        storeId,
        input.sku,
        productId
      );

      if (skuConflict) {
        throw new ConflictError("A product with this SKU already exists.");
      }
    }

    const updateData: Record<string, unknown> = { ...input };

    if (input.name && input.name !== existing.name) {
      updateData.slug = generateSlug(input.name);
    }

    updateData.updatedBy = userId;

    const updated = await this.repository.update(
      productId,
      storeId,
      updateData as Partial<ProductDocument>
    );

    if (!updated) {
      throw new NotFoundError("Product");
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.UPDATE_PRODUCT,
      module: "products",
      description: `Product "${updated.name}" updated.`,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async deleteProduct(
    storeId: string,
    userId: string,
    productId: string
  ): Promise<void> {
    const product = await this.repository.findByIdAndStoreId(
      productId,
      storeId
    );

    if (!product) {
      throw new NotFoundError("Product");
    }

    if (product.stock > 0) {
      throw new BusinessRuleError(
        "Cannot delete a product with stock. Adjust stock to zero first."
      );
    }

    await this.repository.softDelete(productId, storeId, userId);

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.DELETE_PRODUCT,
      module: "products",
      description: `Product "${product.name}" deleted.`,
      createdAt: new Date().toISOString(),
    });
  }

  async getLowStockProducts(storeId: string): Promise<ProductDocument[]> {
    return this.repository.getLowStockProducts(storeId);
  }

  async getDeadStockProducts(
    storeId: string,
    days = 90
  ): Promise<ProductDocument[]> {
    return this.repository.getDeadStockProducts(storeId, days);
  }

  async countProducts(storeId: string): Promise<number> {
    return this.repository.countByStoreId(storeId);
  }
}

let productServiceInstance: ProductService | null = null;

export function getProductService(): ProductService {
  if (!productServiceInstance) {
    productServiceInstance = new ProductService();
  }
  return productServiceInstance;
}
