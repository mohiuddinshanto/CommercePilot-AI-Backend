import { ObjectId } from "mongodb";
import { getClient } from "../../config/database.js";
import { getReturnRepository } from "./returns.repository.js";
import { CreateReturnInput, UpdateReturnInput, ReturnDocument } from "./returns.types.js";
import { getSaleRepository } from "../sales/sales.repository.js";
import { getProductRepository } from "../products/product.repository.js";
import { getInventoryRepository } from "../inventory/inventory.repository.js";
import { getBundleRepository } from "../bundles/bundles.repository.js";
import { getAuthRepository } from "../auth/auth.repository.js";
import { NotFoundError, BusinessRuleError, ValidationError } from "../../utils/error-handler.js";
import { parsePaginationParams } from "../../utils/pagination.js";
import { ACTIVITY_ACTION, RETURN_STATUS } from "../../constants/index.js";
import { restoreInventory } from "../shared/inventory-restore.js";
import { roundCurrency } from "../../utils/helpers.js";

export class ReturnService {
  private returnRepo = getReturnRepository();
  private saleRepo = getSaleRepository();
  private productRepo = getProductRepository();
  private inventoryRepo = getInventoryRepository();
  private bundleRepo = getBundleRepository();
  private authRepository = getAuthRepository();

  private async calculateRefundAmount(
    _storeId: string,
    _saleId: string,
    items: CreateReturnInput["items"]
  ): Promise<{ subtotal: number; refundAmount: number }> {
    let subtotal = 0;

    for (const item of items) {
      const refundAmount = item.refundAmount ?? item.quantity * item.unitPrice;
      if (refundAmount < 0) {
        throw new ValidationError("Validation failed.", [
          { field: "items", message: "Refund amount cannot be negative." },
        ]);
      }
      subtotal += refundAmount;
    }

    return {
      subtotal: roundCurrency(subtotal),
      refundAmount: roundCurrency(subtotal),
    };
  }

  private async validateReturnItems(
    storeId: string,
    saleId: string,
    items: CreateReturnInput["items"]
  ) {
    if (!items || items.length === 0) {
      throw new ValidationError("Validation failed.", [
        { field: "items", message: "At least one item is required." },
      ]);
    }

    const sale = await this.saleRepo.findByIdAndStoreId(saleId, storeId);
    if (!sale) {
      throw new NotFoundError("Sale not found.");
    }

    const existingReturns = await this.returnRepo.findBySaleId(storeId, saleId);
    const returnedQtyMap = new Map<string, number>();

    for (const ret of existingReturns) {
      for (const retItem of ret.items) {
        const key = retItem.productId
          ? `product_${retItem.productId.toString()}`
          : retItem.bundleId
            ? `bundle_${retItem.bundleId.toString()}`
            : "";
        if (key) {
          returnedQtyMap.set(key, (returnedQtyMap.get(key) || 0) + retItem.quantity);
        }
      }
    }

    for (const item of items) {
      if (item.quantity <= 0) {
        throw new ValidationError("Validation failed.", [
          { field: "items", message: "Quantity must be greater than 0." },
        ]);
      }

      if (!item.productId && !item.bundleId) {
        throw new ValidationError("Validation failed.", [
          { field: "items", message: "Each item must have either productId or bundleId." },
        ]);
      }

      if (item.productId) {
        const key = `product_${item.productId}`;
        const alreadyReturned = returnedQtyMap.get(key) || 0;

        const saleItem = sale.items.find(
          (si) => si.productId && si.productId.toString() === item.productId
        );
        if (!saleItem) {
          throw new ValidationError("Validation failed.", [
            { field: "items", message: `Product ${item.productId} was not part of this sale.` },
          ]);
        }

        if (item.quantity > saleItem.quantity - alreadyReturned) {
          throw new BusinessRuleError(
            `Cannot return ${item.quantity} of "${saleItem.name}". Sold: ${saleItem.quantity}, Already returned: ${alreadyReturned}.`
          );
        }
      }

      if (item.bundleId) {
        const key = `bundle_${item.bundleId}`;
        const alreadyReturned = returnedQtyMap.get(key) || 0;

        const saleItem = sale.items.find(
          (si) => si.bundleId && si.bundleId.toString() === item.bundleId
        );
        if (!saleItem) {
          throw new ValidationError("Validation failed.", [
            { field: "items", message: `Bundle ${item.bundleId} was not part of this sale.` },
          ]);
        }

        if (item.quantity > saleItem.quantity - alreadyReturned) {
          throw new BusinessRuleError(
            `Cannot return ${item.quantity} of "${saleItem.name}". Sold: ${saleItem.quantity}, Already returned: ${alreadyReturned}.`
          );
        }
      }
    }

    return sale;
  }

  async createReturn(
    storeId: string,
    userId: string,
    input: CreateReturnInput
  ): Promise<ReturnDocument> {
    const sale = await this.validateReturnItems(storeId, input.saleId, input.items);

    const { subtotal, refundAmount } = await this.calculateRefundAmount(
      storeId,
      input.saleId,
      input.items
    );

    if (refundAmount > sale.grandTotal) {
      throw new BusinessRuleError("Refund amount cannot exceed sale grand total.");
    }

    const now = new Date().toISOString();

    const client = getClient();
    const session = client.startSession();

    try {
      let returnDoc: ReturnDocument | null = null;

      await session.withTransaction(async () => {
        const returnData: Omit<ReturnDocument, "_id"> = {
          storeId,
          saleId: new ObjectId(input.saleId),
          invoiceNumber: sale.invoiceNumber,
          customerId: sale.customerId || null,
          customerName: sale.customerName,
          items: input.items.map((item) => ({
            ...(item.productId ? { productId: new ObjectId(item.productId) } : {}),
            ...(item.bundleId ? { bundleId: new ObjectId(item.bundleId) } : {}),
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            refundAmount: item.refundAmount ?? item.quantity * item.unitPrice,
          })),
          subtotal,
          refundAmount,
          status: RETURN_STATUS.PENDING,
          reason: input.reason?.trim() || "",
          notes: input.notes?.trim() || "",
          isDeleted: false,
          createdBy: userId,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
        };

        returnDoc = await this.returnRepo.create(returnData, session);

        const bundleIds = input.items.filter((i) => i.bundleId).map((i) => i.bundleId!);

        const bundleDocs = bundleIds.length > 0
          ? await this.bundleRepo.findByStoreIdBatch(bundleIds, storeId)
          : [];
        const bundleMap = new Map(bundleDocs.map((b) => [b._id.toString(), b]));

        const movements = await restoreInventory(
          storeId,
          userId,
          input.items.map((item) => ({
            productId: item.productId,
            bundleId: item.bundleId,
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

        await this.authRepository.createActivityLog({
          storeId,
          userId,
          action: ACTIVITY_ACTION.CREATE_RETURN,
          module: "returns",
          description: `Return created for invoice ${sale.invoiceNumber}. Refund: $${refundAmount}.`,
          createdAt: now,
        });
      });

      if (!returnDoc) {
        throw new Error("Failed to create return within transaction.");
      }

      return returnDoc;
    } finally {
      await session.endSession();
    }
  }

  async getReturns(storeId: string, queryParams: Record<string, string>) {
    const { page, limit, skip } = parsePaginationParams(queryParams);

    const allowedSortFields = ["createdAt", "refundAmount", "invoiceNumber", "status"];
    const sortBy = allowedSortFields.includes(queryParams.sortBy || "") ? queryParams.sortBy! : "createdAt";
    const order = queryParams.order === "asc" ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: order as 1 | -1 };

    const { items, total } = await this.returnRepo.findByStoreId(storeId, {
      skip,
      limit,
      search: queryParams.search,
      status: queryParams.status,
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

  async getReturnById(storeId: string, id: string): Promise<ReturnDocument> {
    const returnDoc = await this.returnRepo.findByIdAndStoreId(id, storeId);
    if (!returnDoc) {
      throw new NotFoundError("Return not found.");
    }
    return returnDoc;
  }

  async getReturnByInvoiceNumber(
    storeId: string,
    invoiceNumber: string
  ): Promise<ReturnDocument[]> {
    return this.returnRepo.findByInvoiceNumber(storeId, invoiceNumber);
  }

  async updateReturn(
    storeId: string,
    userId: string,
    id: string,
    input: UpdateReturnInput
  ): Promise<ReturnDocument> {
    const existing = await this.returnRepo.findByIdAndStoreId(id, storeId);
    if (!existing) {
      throw new NotFoundError("Return not found.");
    }

    const updateData: Record<string, unknown> = {};

    if (input.status !== undefined) {
      const allowedStatuses = Object.values(RETURN_STATUS);
      if (!allowedStatuses.includes(input.status as never)) {
        throw new ValidationError("Validation failed.", [
          { field: "status", message: `Status must be one of: ${allowedStatuses.join(", ")}.` },
        ]);
      }
      updateData.status = input.status;
    }

    if (input.reason !== undefined) {
      updateData.reason = input.reason?.trim() || "";
    }

    if (input.notes !== undefined) {
      updateData.notes = input.notes?.trim() || "";
    }

    updateData.updatedBy = userId;

    const updated = await this.returnRepo.update(id, storeId, updateData);
    if (!updated) {
      throw new NotFoundError("Return not found.");
    }

    let activityAction: string = ACTIVITY_ACTION.UPDATE_RETURN;
    if (input.status === RETURN_STATUS.APPROVED) {
      activityAction = ACTIVITY_ACTION.APPROVE_RETURN;
    } else if (input.status === RETURN_STATUS.COMPLETED) {
      activityAction = ACTIVITY_ACTION.COMPLETE_RETURN;
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: activityAction,
      module: "returns",
      description: `Return ${updated.invoiceNumber} updated. Status: ${updated.status}.`,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async deleteReturn(
    storeId: string,
    userId: string,
    id: string
  ): Promise<void> {
    const existing = await this.returnRepo.findByIdAndStoreId(id, storeId);
    if (!existing) {
      throw new NotFoundError("Return not found.");
    }

    await this.returnRepo.softDelete(id, storeId, userId);

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.DELETE_RETURN,
      module: "returns",
      description: `Return ${existing.invoiceNumber} deleted.`,
      createdAt: new Date().toISOString(),
    });
  }

  async getReturnsSummary(storeId: string) {
    return this.returnRepo.getReturnsSummary(storeId);
  }
}

let instance: ReturnService | null = null;

export function getReturnService(): ReturnService {
  if (!instance) {
    instance = new ReturnService();
  }
  return instance;
}
