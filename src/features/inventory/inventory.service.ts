import { ObjectId } from "mongodb";
import { getInventoryRepository } from "./inventory.repository.js";
import { CreateInventoryInput, UpdateInventoryInput, StockMovementInput, InventoryDocument } from "./inventory.types.js";
import { NotFoundError, BusinessRuleError } from "../../utils/error-handler.js";
import { parsePaginationParams } from "../../utils/pagination.js";
import { ACTIVITY_ACTION } from "../../constants/index.js";
import { getAuthRepository } from "../auth/auth.repository.js";
import { getSubscriptionService } from "../subscriptions/subscription.service.js";

export class InventoryService {
  private repo = getInventoryRepository();
  private authRepository = getAuthRepository();
  private subscriptionService = getSubscriptionService();

  async createInventory(storeId: string, userId: string, input: CreateInventoryInput): Promise<InventoryDocument> {
    const storeOid = new ObjectId(storeId);
    const productOid = new ObjectId(input.productId);

    const existing = await this.repo.findByProductIdAndStoreId(storeOid, productOid);
    if (existing) {
      throw new BusinessRuleError("Inventory record already exists for this product.");
    }

    await this.subscriptionService.checkPlanLimit(storeId, "maxInventory");

    const inventory = await this.repo.create({
      storeId: storeOid,
      productId: productOid,
      currentStock: input.currentStock,
      lowStockLimit: input.lowStockLimit ?? 10,
      costPrice: input.costPrice,
      reservedStock: 0,
      availableStock: input.currentStock,
      lastRestockedAt: null,
      lastSoldAt: null,
    });

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.CREATE_INVENTORY,
      module: "inventory",
      description: `Inventory record created for product ${input.productId}.`,
      createdAt: new Date().toISOString(),
    });

    await this.subscriptionService.incrementUsage(storeId, "inventory").catch(() => {});

    return inventory;
  }

  async getInventory(storeId: string, queryParams: Record<string, string>) {
    const storeOid = new ObjectId(storeId);
    const { page, limit, skip } = parsePaginationParams(queryParams);

    const filter: Record<string, unknown> = {};
    if (queryParams.productId) {
      filter.productId = new ObjectId(queryParams.productId);
    }
    if (queryParams.lowStock === "true") {
      filter.$expr = { $lte: ["$currentStock", "$lowStockLimit"] };
    }
    if (queryParams.outOfStock === "true") {
      filter.currentStock = 0;
    }

    const [items, total] = await Promise.all([
      this.repo.findByStoreId(storeOid, filter, { skip, limit }),
      this.repo.countByStoreId(storeOid, filter),
    ]);

    return {
      items,
      page,
      pageSize: limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getInventoryById(storeId: string, id: string): Promise<InventoryDocument> {
    const inventory = await this.repo.findByIdAndStoreId(new ObjectId(storeId), new ObjectId(id));
    if (!inventory) {
      throw new NotFoundError("Inventory record not found.");
    }
    return inventory;
  }

  async updateInventory(storeId: string, userId: string, id: string, input: UpdateInventoryInput): Promise<InventoryDocument> {
    const storeOid = new ObjectId(storeId);
    const invOid = new ObjectId(id);

    const inventory = await this.repo.findByIdAndStoreId(storeOid, invOid);
    if (!inventory) {
      throw new NotFoundError("Inventory record not found.");
    }

    const update: Record<string, unknown> = {};
    if (input.currentStock !== undefined) {
      update.currentStock = input.currentStock;
      update.availableStock = input.currentStock - inventory.reservedStock;
    }
    if (input.lowStockLimit !== undefined) {
      update.lowStockLimit = input.lowStockLimit;
    }
    if (input.costPrice !== undefined) {
      update.costPrice = input.costPrice;
    }

    const updated = await this.repo.update(invOid, storeOid, { $set: update });
    if (!updated) {
      throw new NotFoundError("Inventory record not found.");
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.UPDATE_INVENTORY,
      module: "inventory",
      description: `Inventory record ${id} updated.`,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async deleteInventory(storeId: string, userId: string, id: string): Promise<void> {
    const storeOid = new ObjectId(storeId);
    const invOid = new ObjectId(id);

    const inventory = await this.repo.findByIdAndStoreId(storeOid, invOid);
    if (!inventory) {
      throw new NotFoundError("Inventory record not found.");
    }

    const deleted = await this.repo.softDelete(invOid, storeOid);
    if (!deleted) {
      throw new NotFoundError("Inventory record not found.");
    }

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.DELETE_INVENTORY,
      module: "inventory",
      description: `Inventory record ${id} deleted.`,
      createdAt: new Date().toISOString(),
    });
  }

  async stockIn(storeId: string, userId: string, id: string, input: StockMovementInput): Promise<InventoryDocument> {
    const storeOid = new ObjectId(storeId);
    const invOid = new ObjectId(id);

    const inventory = await this.repo.findByIdAndStoreId(storeOid, invOid);
    if (!inventory) {
      throw new NotFoundError("Inventory record not found.");
    }

    if (input.quantity <= 0) {
      throw new BusinessRuleError("Quantity must be greater than zero.");
    }

    const previousStock = inventory.currentStock;
    const newStock = previousStock + input.quantity;

    const updated = await this.repo.update(invOid, storeOid, {
      $set: {
        currentStock: newStock,
        availableStock: newStock - inventory.reservedStock,
        lastRestockedAt: new Date(),
      },
    });
    if (!updated) {
      throw new NotFoundError("Inventory record not found.");
    }

    await this.repo.createMovement({
      storeId: storeOid,
      inventoryId: invOid,
      productId: inventory.productId,
      type: "stock_in",
      quantity: input.quantity,
      previousStock,
      newStock,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      createdBy: new ObjectId(userId),
    });

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.STOCK_IN,
      module: "inventory",
      description: `Stock in: +${input.quantity} units for inventory ${id}.`,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async stockOut(storeId: string, userId: string, id: string, input: StockMovementInput): Promise<InventoryDocument> {
    const storeOid = new ObjectId(storeId);
    const invOid = new ObjectId(id);

    const inventory = await this.repo.findByIdAndStoreId(storeOid, invOid);
    if (!inventory) {
      throw new NotFoundError("Inventory record not found.");
    }

    if (input.quantity <= 0) {
      throw new BusinessRuleError("Quantity must be greater than zero.");
    }

    const available = inventory.currentStock - inventory.reservedStock;
    if (input.quantity > available) {
      throw new BusinessRuleError("Insufficient stock available.");
    }

    const previousStock = inventory.currentStock;
    const newStock = previousStock - input.quantity;

    const updated = await this.repo.update(invOid, storeOid, {
      $set: {
        currentStock: newStock,
        availableStock: newStock - inventory.reservedStock,
        lastSoldAt: new Date(),
      },
    });
    if (!updated) {
      throw new NotFoundError("Inventory record not found.");
    }

    await this.repo.createMovement({
      storeId: storeOid,
      inventoryId: invOid,
      productId: inventory.productId,
      type: "stock_out",
      quantity: input.quantity,
      previousStock,
      newStock,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      createdBy: new ObjectId(userId),
    });

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.STOCK_OUT,
      module: "inventory",
      description: `Stock out: -${input.quantity} units for inventory ${id}.`,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async adjustStock(storeId: string, userId: string, id: string, input: StockMovementInput): Promise<InventoryDocument> {
    const storeOid = new ObjectId(storeId);
    const invOid = new ObjectId(id);

    const inventory = await this.repo.findByIdAndStoreId(storeOid, invOid);
    if (!inventory) {
      throw new NotFoundError("Inventory record not found.");
    }

    if (input.quantity < 0) {
      throw new BusinessRuleError("Adjustment quantity must not be negative.");
    }

    const previousStock = inventory.currentStock;
    const newStock = input.quantity;

    const updated = await this.repo.update(invOid, storeOid, {
      $set: {
        currentStock: newStock,
        availableStock: newStock - inventory.reservedStock,
      },
    });
    if (!updated) {
      throw new NotFoundError("Inventory record not found.");
    }

    await this.repo.createMovement({
      storeId: storeOid,
      inventoryId: invOid,
      productId: inventory.productId,
      type: "adjustment",
      quantity: input.quantity,
      previousStock,
      newStock,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      createdBy: new ObjectId(userId),
    });

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.STOCK_ADJUSTMENT,
      module: "inventory",
      description: `Stock adjusted from ${previousStock} to ${newStock} for inventory ${id}.`,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  async getLowStock(storeId: string): Promise<InventoryDocument[]> {
    return this.repo.getLowStock(new ObjectId(storeId));
  }

  async getOutOfStock(storeId: string): Promise<InventoryDocument[]> {
    return this.repo.getOutOfStock(new ObjectId(storeId));
  }

  async getMovements(storeId: string, inventoryId: string) {
    const storeOid = new ObjectId(storeId);
    const invOid = new ObjectId(inventoryId);

    const inventory = await this.repo.findByIdAndStoreId(storeOid, invOid);
    if (!inventory) {
      throw new NotFoundError("Inventory record not found.");
    }

    const movements = await this.repo.findMovements(storeOid, { inventoryId: invOid });
    return movements;
  }
}

let instance: InventoryService | null = null;

export function getInventoryService(): InventoryService {
  if (!instance) {
    instance = new InventoryService();
  }
  return instance;
}
