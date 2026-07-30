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
import { ACTIVITY_ACTION, RETURN_STATUS, RETURN_TYPE, SALE_STATUS } from "../../constants/index.js";
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
    const returnType: string = input.returnType || RETURN_TYPE.REFUND;
    const allowedTypes = Object.values(RETURN_TYPE);
    if (!allowedTypes.includes(returnType as never)) {
      throw new ValidationError("Validation failed.", [
        { field: "returnType", message: `Return type must be one of: ${allowedTypes.join(", ")}.` },
      ]);
    }

    const sale = await this.validateReturnItems(storeId, input.saleId, input.items);

    const { subtotal, refundAmount } = await this.calculateRefundAmount(
      storeId,
      input.saleId,
      input.items
    );

    if (refundAmount > sale.grandTotal) {
      throw new BusinessRuleError("Refund amount cannot exceed sale grand total.");
    }

    let exchangeTotal = 0;
    let adjustmentAmount = 0;

    if (returnType === RETURN_TYPE.DIFFERENT_EXCHANGE && input.exchangeItems && input.exchangeItems.length > 0) {
      exchangeTotal = input.exchangeItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      adjustmentAmount = roundCurrency(exchangeTotal - refundAmount);
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
          customerPhone: sale.customerPhone || null,
          returnType,
          items: input.items.map((item) => ({
            ...(item.productId ? { productId: new ObjectId(item.productId) } : {}),
            ...(item.bundleId ? { bundleId: new ObjectId(item.bundleId) } : {}),
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            refundAmount: item.refundAmount ?? item.quantity * item.unitPrice,
          })),
          subtotal,
          refundAmount,
          exchangeItems: returnType === RETURN_TYPE.DIFFERENT_EXCHANGE && input.exchangeItems
            ? input.exchangeItems.map((ei) => ({
                productId: ei.productId,
                name: ei.name,
                sku: ei.sku,
                quantity: ei.quantity,
                unitPrice: ei.unitPrice,
                totalPrice: roundCurrency(ei.quantity * ei.unitPrice),
              }))
            : undefined,
          exchangeTotal: exchangeTotal > 0 ? exchangeTotal : undefined,
          adjustmentAmount: returnType === RETURN_TYPE.DIFFERENT_EXCHANGE ? adjustmentAmount : undefined,
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

        if (returnType === RETURN_TYPE.DIFFERENT_EXCHANGE && input.exchangeItems && input.exchangeItems.length > 0) {
          for (const exItem of input.exchangeItems) {
            const product = await this.productRepo.findByIdAndStoreId(exItem.productId, storeId);
            if (!product) {
              throw new NotFoundError(`Exchange product ${exItem.name} not found.`);
            }

            const invs = await this.inventoryRepo.findByProductIds(
              new ObjectId(storeId),
              [new ObjectId(exItem.productId)]
            );
            const inv = invs.length > 0 ? invs[0] : null;
            if (!inv) {
              throw new NotFoundError(`Inventory for product ${exItem.name} not found.`);
            }
            if (inv.currentStock < exItem.quantity) {
              throw new BusinessRuleError(`Insufficient stock for "${exItem.name}". Available: ${inv.currentStock}, needed: ${exItem.quantity}.`);
            }

            const newStock = product.stock - exItem.quantity;
            await this.productRepo.update(exItem.productId, storeId, { stock: newStock });

            await this.inventoryRepo.update(inv._id, new ObjectId(storeId), {
              $set: {
                currentStock: newStock,
                availableStock: newStock - inv.reservedStock,
              },
            });

            await this.inventoryRepo.createMovement({
              storeId: new ObjectId(storeId),
              inventoryId: inv._id,
              productId: new ObjectId(exItem.productId),
              type: "return",
              quantity: -exItem.quantity,
              previousStock: product.stock,
              newStock,
              reference: returnDoc!._id.toString(),
              notes: `Exchange - return ${returnDoc!.invoiceNumber}`,
              createdBy: new ObjectId(userId),
            });
          }
        }

        const descParts = [`Return created for invoice ${sale.invoiceNumber}`];
        if (returnType === RETURN_TYPE.REFUND) {
          descParts.push(`Refund: $${refundAmount}.`);
        } else if (returnType === RETURN_TYPE.SAME_EXCHANGE) {
          descParts.push(`Same product exchange. Refund: $${refundAmount}.`);
        } else if (returnType === RETURN_TYPE.DIFFERENT_EXCHANGE) {
          const adj = adjustmentAmount >= 0 ? `Customer pays $${Math.abs(adjustmentAmount)}` : `Refund $${Math.abs(adjustmentAmount)}`;
          descParts.push(`Different product exchange. ${adj}.`);
        }

        await this.authRepository.createActivityLog({
          storeId,
          userId,
          action: ACTIVITY_ACTION.CREATE_RETURN,
          module: "returns",
          description: descParts.join(" "),
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

    if (input.status === RETURN_STATUS.APPROVED && existing.status === RETURN_STATUS.PENDING) {
      await this.adjustSaleOnReturnApproval(storeId, userId, existing);
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
      description: input.status === RETURN_STATUS.APPROVED
        ? `Return ${updated.invoiceNumber} approved. Refund: $${updated.refundAmount}. Sale adjusted.`
        : `Return ${updated.invoiceNumber} updated. Status: ${updated.status}.`,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  private async adjustSaleOnReturnApproval(
    storeId: string,
    _userId: string,
    returnDoc: ReturnDocument
  ): Promise<void> {
    const sale = await this.saleRepo.findByIdAndStoreId(returnDoc.saleId.toString(), storeId);
    if (!sale) {
      throw new NotFoundError("Sale not found for return adjustment.");
    }

    const originalSubtotal = sale.subtotal;
    const originalDiscount = sale.discount;
    const originalItems = [...sale.items];

    const returnedQtyMap = new Map<string, number>();
    for (const item of returnDoc.items) {
      const key = item.productId
        ? `product_${item.productId.toString()}`
        : item.bundleId
          ? `bundle_${item.bundleId.toString()}`
          : "";
      if (key) {
        returnedQtyMap.set(key, (returnedQtyMap.get(key) || 0) + item.quantity);
      }
    }

    const newItems = originalItems
      .map((si) => {
        const key = si.productId
          ? `product_${si.productId.toString()}`
          : si.bundleId
            ? `bundle_${si.bundleId.toString()}`
            : "";
        const returnQty = returnedQtyMap.get(key) || 0;
        if (returnQty === 0) return si;

        const newQty = si.quantity - returnQty;
        if (newQty <= 0) return null;

        const totalPrice = roundCurrency(newQty * si.unitPrice);
        return { ...si, quantity: newQty, totalPrice };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const newSubtotal = roundCurrency(newItems.reduce((sum, item) => sum + item.totalPrice, 0));

    let newDiscount = 0;
    if (originalSubtotal > 0) {
      newDiscount = roundCurrency((newSubtotal / originalSubtotal) * originalDiscount);
    }

    const newGrandTotal = roundCurrency(newSubtotal - newDiscount + sale.tax + sale.shipping);

    let newPaidAmount = sale.paidAmount;
    let newDueAmount = newGrandTotal - newPaidAmount;
    if (newDueAmount < 0) {
      newPaidAmount = newGrandTotal;
      newDueAmount = 0;
    }

    const allReturned = newItems.length === 0;

    await this.saleRepo.update(sale._id.toString(), storeId, {
      items: newItems,
      subtotal: newSubtotal,
      discount: newDiscount,
      grandTotal: newGrandTotal,
      paidAmount: newPaidAmount,
      dueAmount: newDueAmount,
      status: allReturned ? SALE_STATUS.REFUNDED : sale.status,
    });

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
