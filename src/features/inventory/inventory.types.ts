import { ObjectId } from "mongodb";

export interface InventoryDocument {
  _id: ObjectId;
  storeId: ObjectId;
  productId: ObjectId;
  currentStock: number;
  lowStockLimit: number;
  reservedStock: number;
  availableStock: number;
  costPrice: number;
  lastRestockedAt: Date | null;
  lastSoldAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface InventoryMovementDocument {
  _id: ObjectId;
  storeId: ObjectId;
  inventoryId: ObjectId;
  productId: ObjectId;
  type: "stock_in" | "stock_out" | "adjustment" | "sale" | "return";
  quantity: number;
  previousStock: number;
  newStock: number;
  reference: string | null;
  notes: string | null;
  createdBy: ObjectId;
  createdAt: Date;
}

export interface CreateInventoryInput {
  productId: string;
  currentStock: number;
  lowStockLimit?: number;
  costPrice: number;
}

export interface UpdateInventoryInput {
  currentStock?: number;
  lowStockLimit?: number;
  costPrice?: number;
}

export interface StockMovementInput {
  type: "stock_in" | "stock_out" | "adjustment" | "sale" | "return";
  quantity: number;
  reference?: string;
  notes?: string;
}
