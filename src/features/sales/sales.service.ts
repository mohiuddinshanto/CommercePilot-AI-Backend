import { ObjectId } from "mongodb";
import { getClient } from "../../config/database.js";
import { getSaleRepository } from "./sales.repository.js";
import { CreateSaleInput, UpdateSaleInput, SaleDocument } from "./sales.types.js";
import { getProductRepository } from "../products/product.repository.js";
import { getInventoryRepository } from "../inventory/inventory.repository.js";
import { getBundleRepository } from "../bundles/bundles.repository.js";
import { NotFoundError, BusinessRuleError, ValidationError } from "../../utils/error-handler.js";
import { parsePaginationParams } from "../../utils/pagination.js";
import { ACTIVITY_ACTION, PAYMENT_STATUS, SALE_STATUS } from "../../constants/index.js";
import { getAuthRepository } from "../auth/auth.repository.js";
import { restoreInventory } from "../shared/inventory-restore.js";
import { roundCurrency } from "../../utils/helpers.js";

export class SaleService {
  private saleRepo = getSaleRepository();
  private productRepo = getProductRepository();
  private inventoryRepo = getInventoryRepository();
  private bundleRepo = getBundleRepository();
  private authRepository = getAuthRepository();

  private async validateAndPrepareItems(
    storeId: string,
    items: CreateSaleInput["items"]
  ) {
    if (!items || items.length === 0) {
      throw new ValidationError("Validation failed.", [
        { field: "items", message: "At least one item is required." },
      ]);
    }

    const productIds: string[] = [];
    const bundleIds: string[] = [];

    for (const item of items) {
      if (item.quantity <= 0) {
        throw new ValidationError("Validation failed.", [
          { field: "items", message: "Quantity must be greater than 0." },
        ]);
      }
      if (item.unitPrice < 0) {
        throw new ValidationError("Validation failed.", [
          { field: "items", message: "Unit price cannot be negative." },
        ]);
      }
      if (!item.productId && !item.bundleId) {
        throw new ValidationError("Validation failed.", [
          { field: "items", message: "Each item must have either productId or bundleId." },
        ]);
      }
      if (item.productId) productIds.push(item.productId);
      if (item.bundleId) bundleIds.push(item.bundleId);
    }

    const productDocs = await this.productRepo.findByIds(productIds, storeId);
    const productMap = new Map(
      productDocs.map((p) => [p._id.toString(), p])
    );

    for (const pid of productIds) {
      if (!productMap.has(pid)) {
        throw new NotFoundError(`Product not found: ${pid}`);
      }
      const product = productMap.get(pid)!;
      if (product.status === "archived") {
        throw new BusinessRuleError(`Product "${product.name}" is archived and cannot be sold.`);
      }
    }

    const bundleDocs = await this.bundleRepo.findByStoreIdBatch(bundleIds, storeId);
    const bundleMap = new Map(
      bundleDocs.map((b) => [b._id.toString(), b])
    );

    for (const bid of bundleIds) {
      if (!bundleMap.has(bid)) {
        throw new NotFoundError(`Bundle not found: ${bid}`);
      }
    }

    const bundleProductIds: string[] = [];
    for (const bundle of bundleDocs) {
      for (const bp of bundle.products) {
        const pid = bp.productId.toString();
        if (!productMap.has(pid)) {
          bundleProductIds.push(pid);
        }
      }
    }

    if (bundleProductIds.length > 0) {
      const bundleProductDocs = await this.productRepo.findByIds(bundleProductIds, storeId);
      for (const p of bundleProductDocs) {
        const pid = p._id.toString();
        if (!productMap.has(pid)) {
          productMap.set(pid, p);
        }
      }
    }

    for (const item of items) {
      if (item.productId) {
        const product = productMap.get(item.productId)!;
        if (product.stock < item.quantity) {
          throw new BusinessRuleError(
            `Insufficient stock for "${product.name}". Available: ${product.stock}, Requested: ${item.quantity}`
          );
        }
      }
    }

    for (const item of items) {
      if (item.bundleId) {
        const bundle = bundleMap.get(item.bundleId)!;
        for (const bundleProduct of bundle.products) {
          const product = productMap.get(bundleProduct.productId.toString());
          if (!product) {
            throw new BusinessRuleError(
              `Bundle product not found: ${bundleProduct.productId}`
            );
          }
          const requiredQty = bundleProduct.quantity * item.quantity;
          if (product.stock < requiredQty) {
            throw new BusinessRuleError(
              `Insufficient stock for bundle "${bundle.name}" product "${product.name}". Available: ${product.stock}, Required: ${requiredQty}`
            );
          }
        }
      }
    }

    return { productMap, bundleMap };
  }

  private async deductInventory(
    storeId: string,
    userId: string,
    items: CreateSaleInput["items"],
    productMap: Map<string, { _id: { toString(): string }; stock: number; name: string }>,
    bundleMap: Map<string, { products: { productId: { toString(): string }; quantity: number }[] }>
  ) {
    const deductions: { productId: string; quantity: number }[] = [];

    try {
      const allProductIds: string[] = [];

      for (const item of items) {
        if (item.productId) {
          allProductIds.push(item.productId);
        }
        if (item.bundleId) {
          const bundle = bundleMap.get(item.bundleId)!;
          for (const bundleProduct of bundle.products) {
            allProductIds.push(bundleProduct.productId.toString());
          }
        }
      }

      const uniqueProductIds = [...new Set(allProductIds)];
      const inventoryRecords = uniqueProductIds.length > 0
        ? await this.inventoryRepo.findByProductIds(
            new ObjectId(storeId),
            uniqueProductIds.map((pid) => new ObjectId(pid))
          )
        : [];
      const inventoryLookup = new Map(
        inventoryRecords.map((inv) => [inv.productId.toString(), inv])
      );

      for (const item of items) {
        if (item.productId) {
          const product = productMap.get(item.productId)!;
          const newStock = product.stock - item.quantity;

          await this.productRepo.update(item.productId, storeId, {
            stock: newStock,
          });

          const inventory = inventoryLookup.get(item.productId);
          if (inventory) {
            await this.inventoryRepo.update(
              inventory._id,
              new ObjectId(storeId),
              {
                $set: {
                  currentStock: newStock,
                  availableStock: newStock - inventory.reservedStock,
                },
              }
            );

            await this.inventoryRepo.createMovement({
              storeId: new ObjectId(storeId),
              inventoryId: inventory._id,
              productId: new ObjectId(item.productId),
              type: "sale",
              quantity: item.quantity,
              previousStock: product.stock,
              newStock,
              reference: null,
              notes: null,
              createdBy: new ObjectId(userId),
            });
          }

          deductions.push({ productId: item.productId, quantity: item.quantity });
        }

        if (item.bundleId) {
          const bundle = bundleMap.get(item.bundleId)!;
          for (const bundleProduct of bundle.products) {
            const pid = bundleProduct.productId.toString();
            const product = productMap.get(pid);
            if (!product) continue;

            const deductQty = bundleProduct.quantity * item.quantity;
            const newStock = product.stock - deductQty;

            await this.productRepo.update(pid, storeId, {
              stock: newStock,
            });

            const inventory = inventoryLookup.get(pid);
            if (inventory) {
              await this.inventoryRepo.update(
                inventory._id,
                new ObjectId(storeId),
                {
                  $set: {
                    currentStock: newStock,
                    availableStock: newStock - inventory.reservedStock,
                  },
                }
              );

              await this.inventoryRepo.createMovement({
                storeId: new ObjectId(storeId),
                inventoryId: inventory._id,
                productId: new ObjectId(pid),
                type: "sale",
                quantity: deductQty,
                previousStock: product.stock,
                newStock,
                reference: null,
                notes: null,
                createdBy: new ObjectId(userId),
              });
            }

            deductions.push({ productId: pid, quantity: deductQty });
          }
        }
      }
    } catch (error) {
      for (const d of deductions) {
        const product = await this.productRepo.findByIds([d.productId], storeId);
        if (product.length > 0) {
          const currentStock = product[0].stock;
          await this.productRepo.update(d.productId, storeId, {
            stock: currentStock + d.quantity,
          });
        }
      }
      throw error;
    }
  }

  private calculateTotals(items: { quantity: number; unitPrice: number }[], discount: number, tax: number, shipping: number) {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const subtotalRounded = roundCurrency(subtotal);
    const grandTotal = roundCurrency(subtotalRounded - discount + tax + shipping);

    return {
      subtotal: subtotalRounded,
      grandTotal: grandTotal < 0 ? 0 : grandTotal,
    };
  }

  async createSale(
    storeId: string,
    userId: string,
    input: CreateSaleInput
  ): Promise<SaleDocument> {
    if (!input.paymentMethod) {
      throw new ValidationError("Validation failed.", [
        { field: "paymentMethod", message: "Payment method is required." },
      ]);
    }

    const allowedMethods = ["cash", "card", "mobile_banking", "bank_transfer"];
    if (!allowedMethods.includes(input.paymentMethod)) {
      throw new ValidationError("Validation failed.", [
        { field: "paymentMethod", message: `Payment method must be one of: ${allowedMethods.join(", ")}.` },
      ]);
    }

    if (input.paidAmount === undefined || input.paidAmount === null) {
      throw new ValidationError("Validation failed.", [
        { field: "paidAmount", message: "Paid amount is required." },
      ]);
    }

    if (typeof input.paidAmount !== "number" || input.paidAmount < 0) {
      throw new ValidationError("Validation failed.", [
        { field: "paidAmount", message: "Paid amount must be a non-negative number." },
      ]);
    }

    const discount = input.discount || 0;
    const tax = input.tax || 0;
    const shipping = input.shipping || 0;

    if (discount < 0) {
      throw new ValidationError("Validation failed.", [
        { field: "discount", message: "Discount cannot be negative." },
      ]);
    }
    if (tax < 0) {
      throw new ValidationError("Validation failed.", [
        { field: "tax", message: "Tax cannot be negative." },
      ]);
    }
    if (shipping < 0) {
      throw new ValidationError("Validation failed.", [
        { field: "shipping", message: "Shipping cannot be negative." },
      ]);
    }

    const { productMap, bundleMap } = await this.validateAndPrepareItems(storeId, input.items);

    const itemsWithTotal = input.items.map((item) => ({
      ...item,
      totalPrice: roundCurrency(item.quantity * item.unitPrice),
    }));

    const { subtotal, grandTotal } = this.calculateTotals(
      input.items,
      discount,
      tax,
      shipping
    );

    if (input.paidAmount > grandTotal) {
      throw new BusinessRuleError("Paid amount cannot exceed grand total.");
    }

    let paymentStatus: string;
    if (input.paidAmount >= grandTotal) {
      paymentStatus = PAYMENT_STATUS.PAID;
    } else if (input.paidAmount > 0) {
      paymentStatus = PAYMENT_STATUS.PARTIAL;
    } else {
      paymentStatus = PAYMENT_STATUS.PENDING;
    }

    const dueAmount = roundCurrency(grandTotal - input.paidAmount);

    const client = getClient();
    const session = client.startSession();

    try {
      let sale: SaleDocument | null = null;

      await session.withTransaction(async () => {
        await this.deductInventory(storeId, userId, input.items, productMap, bundleMap);

        const invoiceNumber = await this.saleRepo.getNextInvoiceNumber(storeId);

        const now = new Date().toISOString();
        sale = await this.saleRepo.create({
          storeId,
          invoiceNumber,
          customerId: input.customerId ? new ObjectId(input.customerId) : null,
          customerName: input.customerName?.trim() || "Walk-in Customer",
          customerPhone: input.customerPhone?.trim() || "",
          items: itemsWithTotal.map((item) => ({
            ...(item.productId ? { productId: new ObjectId(item.productId) } : {}),
            ...(item.bundleId ? { bundleId: new ObjectId(item.bundleId) } : {}),
            name: item.name,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
          subtotal,
          discount,
          tax,
          shipping,
          grandTotal,
          paidAmount: input.paidAmount,
          dueAmount,
          paymentMethod: input.paymentMethod,
          paymentStatus,
          status: SALE_STATUS.COMPLETED,
          notes: input.notes?.trim() || "",
          isDeleted: false,
          createdBy: userId,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
        });

        await this.authRepository.createActivityLog({
          storeId,
          userId,
          action: ACTIVITY_ACTION.CREATE_SALE,
          module: "sales",
          description: `Sale ${invoiceNumber} created with ${input.items.length} items. Total: $${grandTotal}.`,
          createdAt: now,
        });
      });

      if (!sale) {
        throw new Error("Failed to create sale within transaction.");
      }

      return sale;
    } finally {
      await session.endSession();
    }
  }

  async getSales(storeId: string, queryParams: Record<string, string>) {
    const { page, limit, skip } = parsePaginationParams(queryParams);

    const allowedSortFields = ["createdAt", "grandTotal", "invoiceNumber", "customerName", "status", "paymentStatus"];
    const sortBy = allowedSortFields.includes(queryParams.sortBy || "") ? queryParams.sortBy! : "createdAt";
    const order = queryParams.order === "asc" ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: order as 1 | -1 };

    const { items, total } = await this.saleRepo.findByStoreId(storeId, {
      skip,
      limit,
      search: queryParams.search,
      status: queryParams.status,
      paymentStatus: queryParams.paymentStatus,
      paymentMethod: queryParams.paymentMethod,
      startDate: queryParams.startDate,
      endDate: queryParams.endDate,
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

  async getSaleById(storeId: string, id: string): Promise<SaleDocument> {
    const sale = await this.saleRepo.findByIdAndStoreId(id, storeId);
    if (!sale) {
      throw new NotFoundError("Sale not found.");
    }
    return sale;
  }

  async getSaleByInvoiceNumber(storeId: string, invoiceNumber: string): Promise<SaleDocument> {
    const sale = await this.saleRepo.findByInvoiceNumber(storeId, invoiceNumber);
    if (!sale) {
      throw new NotFoundError("Sale not found.");
    }
    return sale;
  }

  async updateSale(
    storeId: string,
    userId: string,
    id: string,
    input: UpdateSaleInput
  ): Promise<SaleDocument> {
    const existing = await this.saleRepo.findByIdAndStoreId(id, storeId);
    if (!existing) {
      throw new NotFoundError("Sale not found.");
    }

    if (existing.status === SALE_STATUS.CANCELLED) {
      throw new BusinessRuleError("Cannot update a cancelled sale.");
    }

    const updateData: Record<string, unknown> = {};

    if (input.customerId !== undefined) {
      updateData.customerId = input.customerId ? new ObjectId(input.customerId) : null;
    }
    if (input.customerName !== undefined) {
      updateData.customerName = input.customerName?.trim() || "Walk-in Customer";
    }
    if (input.customerPhone !== undefined) {
      updateData.customerPhone = input.customerPhone?.trim() || "";
    }
    if (input.notes !== undefined) {
      updateData.notes = input.notes?.trim() || "";
    }
    if (input.paymentMethod !== undefined) {
      updateData.paymentMethod = input.paymentMethod;
    }
    if (input.paymentStatus !== undefined) {
      updateData.paymentStatus = input.paymentStatus;
    }
    if (input.status !== undefined) {
      updateData.status = input.status;
    }

    if (input.paidAmount !== undefined) {
      const grandTotal = existing.grandTotal;
      if (input.paidAmount > grandTotal) {
        throw new BusinessRuleError("Paid amount cannot exceed grand total.");
      }
      updateData.paidAmount = input.paidAmount;
      updateData.dueAmount = roundCurrency(grandTotal - input.paidAmount);

      if (input.paidAmount >= grandTotal) {
        updateData.paymentStatus = PAYMENT_STATUS.PAID;
      } else if (input.paidAmount > 0) {
        updateData.paymentStatus = PAYMENT_STATUS.PARTIAL;
      } else {
        updateData.paymentStatus = PAYMENT_STATUS.PENDING;
      }
    }

    updateData.updatedBy = userId;

    const updated = await this.saleRepo.update(id, storeId, updateData);
    if (!updated) {
      throw new NotFoundError("Sale not found.");
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.UPDATE_SALE,
      module: "sales",
      description: `Sale ${updated.invoiceNumber} updated.`,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async deleteSale(
    storeId: string,
    userId: string,
    id: string
  ): Promise<void> {
    const existing = await this.saleRepo.findByIdAndStoreId(id, storeId);
    if (!existing) {
      throw new NotFoundError("Sale not found.");
    }

    const { bundleMap } = await this.validateAndPrepareItems(
      storeId,
      existing.items.map((item) => ({
        productId: item.productId?.toString(),
        bundleId: item.bundleId?.toString(),
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }))
    );

    const movements = await restoreInventory(
      storeId,
      userId,
      existing.items.map((item) => ({
        productId: item.productId?.toString(),
        bundleId: item.bundleId?.toString(),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      bundleMap,
      this.productRepo,
      this.inventoryRepo,
    );

    for (const movement of movements) {
      await this.inventoryRepo.createMovement(movement);
    }

    await this.saleRepo.softDelete(id, storeId, userId);

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.DELETE_SALE,
      module: "sales",
      description: `Sale ${existing.invoiceNumber} deleted.`,
      createdAt: new Date().toISOString(),
    });
  }

  async getTodaySales(storeId: string) {
    return this.saleRepo.getTodaySales(storeId);
  }

  async getSalesSummary(storeId: string) {
    return this.saleRepo.getSalesSummary(storeId);
  }
}

let instance: SaleService | null = null;

export function getSaleService(): SaleService {
  if (!instance) {
    instance = new SaleService();
  }
  return instance;
}
