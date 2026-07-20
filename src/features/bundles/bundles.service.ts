import { ObjectId } from "mongodb";
import { getBundleRepository } from "./bundles.repository";
import { CreateBundleInput, UpdateBundleInput, BundleDocument } from "./bundles.types";
import { getProductRepository } from "../products/product.repository";
import { NotFoundError, BusinessRuleError, ValidationError } from "../../utils/error-handler";
import { parsePaginationParams } from "../../utils/pagination";
import { ACTIVITY_ACTION, BUNDLE_STATUS } from "../../constants";
import { getAuthRepository } from "../auth/auth.repository";
import { generateSlug } from "../../utils/helpers";

export class BundleService {
  private repo = getBundleRepository();
  private productRepo = getProductRepository();
  private authRepository = getAuthRepository();

  private async validateProducts(
    storeId: string,
    products: { productId: string; quantity: number }[]
  ) {
    if (!products || products.length === 0) {
      throw new ValidationError("Validation failed.", [
        { field: "products", message: "At least one product is required." },
      ]);
    }

    const duplicateIds = products.map((p) => p.productId);
    const uniqueIds = new Set(duplicateIds);
    if (uniqueIds.size !== duplicateIds.length) {
      throw new BusinessRuleError("Duplicate products are not allowed in the same bundle.");
    }

    for (const item of products) {
      if (!item.quantity || item.quantity < 1) {
        throw new ValidationError("Validation failed.", [
          { field: "products", message: "Each product quantity must be at least 1." },
        ]);
      }
    }

    const productDocs = await this.productRepo.findByIds(
      products.map((p) => p.productId),
      storeId
    );

    if (productDocs.length !== products.length) {
      const foundIds = new Set(productDocs.map((p) => p._id.toString()));
      const missing = products
        .filter((p) => !foundIds.has(p.productId))
        .map((p) => p.productId);
      throw new NotFoundError(`Product(s) not found: ${missing.join(", ")}`);
    }

    for (const doc of productDocs) {
      if (doc.status === "archived") {
        throw new BusinessRuleError(`Product "${doc.name}" is archived and cannot be added to a bundle.`);
      }
    }

    return productDocs;
  }

  private calculatePricing(
    products: { productId: string; quantity: number }[],
    productDocs: { _id: { toString(): string }; sellingPrice: number }[],
    bundlePrice: number
  ) {
    const priceMap = new Map(
      productDocs.map((p) => [p._id.toString(), p.sellingPrice])
    );

    const originalPrice = products.reduce((sum, item) => {
      const price = priceMap.get(item.productId) || 0;
      return sum + price * item.quantity;
    }, 0);

    const originalPriceRounded = Math.round(originalPrice * 100) / 100;

    if (bundlePrice > originalPriceRounded) {
      throw new BusinessRuleError("Bundle price cannot exceed the original price.");
    }

    const discountAmount = Math.round((originalPriceRounded - bundlePrice) * 100) / 100;
    const discountPercentage =
      originalPriceRounded > 0
        ? Math.round((discountAmount / originalPriceRounded) * 10000) / 100
        : 0;

    return {
      originalPrice: originalPriceRounded,
      bundlePrice: Math.round(bundlePrice * 100) / 100,
      discountAmount,
      discountPercentage,
    };
  }

  async createBundle(
    storeId: string,
    userId: string,
    input: CreateBundleInput
  ): Promise<BundleDocument> {
    if (!input.name || input.name.trim() === "") {
      throw new ValidationError("Validation failed.", [
        { field: "name", message: "Name is required." },
      ]);
    }

    if (input.bundlePrice === undefined || input.bundlePrice === null) {
      throw new ValidationError("Validation failed.", [
        { field: "bundlePrice", message: "Bundle price is required." },
      ]);
    }

    if (typeof input.bundlePrice !== "number" || input.bundlePrice < 0) {
      throw new ValidationError("Validation failed.", [
        { field: "bundlePrice", message: "Bundle price must be a non-negative number." },
      ]);
    }

    const productDocs = await this.validateProducts(storeId, input.products);
    const pricing = this.calculatePricing(input.products, productDocs, input.bundlePrice);

    let slug = generateSlug(input.name);
    const existingBundle = await this.repo.findByStoreId(storeId, { search: slug, limit: 1 });
    if (existingBundle.items.some((b) => b.slug === slug)) {
      slug = `${slug}-${Date.now()}`;
    }

    const now = new Date().toISOString();
    const bundle = await this.repo.create({
      storeId,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || "",
      image: input.image?.trim() || "",
      products: input.products.map((p) => ({
        productId: new ObjectId(p.productId),
        quantity: p.quantity,
      })),
      originalPrice: pricing.originalPrice,
      bundlePrice: pricing.bundlePrice,
      discountAmount: pricing.discountAmount,
      discountPercentage: pricing.discountPercentage,
      status: input.status || BUNDLE_STATUS.DRAFT,
      isDeleted: false,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.CREATE_BUNDLE,
      module: "bundles",
      description: `Bundle "${input.name}" created with ${input.products.length} products.`,
      createdAt: now,
    });

    return bundle;
  }

  async getBundles(storeId: string, queryParams: Record<string, string>) {
    const { page, limit, skip } = parsePaginationParams(queryParams);

    const allowedSortFields = ["createdAt", "name", "sellingPrice", "totalValue", "status"];
    const sortBy = allowedSortFields.includes(queryParams.sortBy || "") ? queryParams.sortBy! : "createdAt";
    const order = queryParams.order === "asc" ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: order as 1 | -1 };

    const { items, total } = await this.repo.findByStoreId(storeId, {
      skip,
      limit,
      search: queryParams.search,
      status: queryParams.status,
      sort,
    });

    return {
      items,
      page,
      pageSize: limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getBundleById(storeId: string, id: string): Promise<BundleDocument> {
    const bundle = await this.repo.findByIdAndStoreId(id, storeId);
    if (!bundle) {
      throw new NotFoundError("Bundle not found.");
    }
    return bundle;
  }

  async updateBundle(
    storeId: string,
    userId: string,
    id: string,
    input: UpdateBundleInput
  ): Promise<BundleDocument> {
    const existing = await this.repo.findByIdAndStoreId(id, storeId);
    if (!existing) {
      throw new NotFoundError("Bundle not found.");
    }

    const updateData: Record<string, unknown> = {};

    if (input.name !== undefined) {
      if (!input.name || input.name.trim() === "") {
        throw new ValidationError("Validation failed.", [
          { field: "name", message: "Name cannot be empty." },
        ]);
      }
      updateData.name = input.name.trim();
    }

    if (input.description !== undefined) {
      updateData.description = input.description?.trim() || "";
    }

    if (input.image !== undefined) {
      updateData.image = input.image?.trim() || "";
    }

    if (input.status !== undefined) {
      updateData.status = input.status;
    }

    const products = input.products || existing.products.map((p) => ({
      productId: p.productId.toString(),
      quantity: p.quantity,
    }));

    if (input.products !== undefined) {
      await this.validateProducts(storeId, input.products);
    }

    const bundlePrice =
      input.bundlePrice !== undefined ? input.bundlePrice : existing.bundlePrice;

    if (input.bundlePrice !== undefined) {
      if (typeof input.bundlePrice !== "number" || input.bundlePrice < 0) {
        throw new ValidationError("Validation failed.", [
          { field: "bundlePrice", message: "Bundle price must be a non-negative number." },
        ]);
      }
    }

    const productDocs = await this.validateProducts(storeId, products);
    const pricing = this.calculatePricing(products, productDocs, bundlePrice);

    updateData.products = products.map((p) => ({
      productId: new ObjectId(p.productId),
      quantity: p.quantity,
    }));
    updateData.originalPrice = pricing.originalPrice;
    updateData.bundlePrice = pricing.bundlePrice;
    updateData.discountAmount = pricing.discountAmount;
    updateData.discountPercentage = pricing.discountPercentage;
    updateData.updatedBy = userId;

    const updated = await this.repo.update(id, storeId, updateData);
    if (!updated) {
      throw new NotFoundError("Bundle not found.");
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.UPDATE_BUNDLE,
      module: "bundles",
      description: `Bundle "${updated.name}" updated.`,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async deleteBundle(
    storeId: string,
    userId: string,
    id: string
  ): Promise<void> {
    const existing = await this.repo.findByIdAndStoreId(id, storeId);
    if (!existing) {
      throw new NotFoundError("Bundle not found.");
    }

    await this.repo.softDelete(id, storeId, userId);

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.DELETE_BUNDLE,
      module: "bundles",
      description: `Bundle "${existing.name}" deleted.`,
      createdAt: new Date().toISOString(),
    });
  }

  async getBundleStock(storeId: string, id: string): Promise<{ bundleId: string; availableStock: number }> {
    const bundle = await this.repo.findByIdAndStoreId(id, storeId);
    if (!bundle) {
      throw new NotFoundError("Bundle not found.");
    }

    const productIds = bundle.products.map((p) => p.productId.toString());
    const productDocs = await this.productRepo.findByIds(productIds, storeId);

    const stockMap = new Map(
      productDocs.map((p) => [p._id.toString(), p.stock])
    );

    let minStock = Infinity;
    for (const item of bundle.products) {
      const stock = stockMap.get(item.productId.toString()) || 0;
      const available = Math.floor(stock / item.quantity);
      if (available < minStock) {
        minStock = available;
      }
    }

    return {
      bundleId: id,
      availableStock: minStock === Infinity ? 0 : minStock,
    };
  }
}

let instance: BundleService | null = null;

export function getBundleService(): BundleService {
  if (!instance) {
    instance = new BundleService();
  }
  return instance;
}
