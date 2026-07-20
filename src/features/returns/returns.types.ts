import { ObjectId } from "mongodb";

export interface ReturnItem {
  productId?: ObjectId;
  bundleId?: ObjectId;
  quantity: number;
  unitPrice: number;
  refundAmount: number;
}

export interface ReturnDocument {
  _id: ObjectId;
  storeId: string;
  saleId: ObjectId;
  invoiceNumber: string;
  customerId?: ObjectId | null;
  customerName: string;
  items: ReturnItem[];
  subtotal: number;
  refundAmount: number;
  status: string;
  reason: string;
  notes: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReturnInput {
  saleId: string;
  items: {
    productId?: string;
    bundleId?: string;
    quantity: number;
    unitPrice: number;
    refundAmount?: number;
  }[];
  reason: string;
  notes?: string;
}

export interface UpdateReturnInput {
  status?: string;
  reason?: string;
  notes?: string;
}

export interface ReturnQueryParams {
  page?: string;
  limit?: string;
  search?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  order?: string;
}
