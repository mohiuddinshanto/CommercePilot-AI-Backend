import { ObjectId } from "mongodb";

export interface SaleItem {
  productId?: ObjectId;
  bundleId?: ObjectId;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface SaleDocument {
  _id: ObjectId;
  storeId: string;
  invoiceNumber: string;
  customerId?: ObjectId | null;
  customerName: string;
  customerPhone: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  notes: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSaleInput {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items: {
    productId?: string;
    bundleId?: string;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
  }[];
  discount?: number;
  tax?: number;
  shipping?: number;
  paidAmount: number;
  paymentMethod: string;
  notes?: string;
}

export interface UpdateSaleInput {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items?: {
    productId?: string;
    bundleId?: string;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
  }[];
  discount?: number;
  tax?: number;
  shipping?: number;
  paidAmount?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  status?: string;
  notes?: string;
}

export interface SaleQueryParams {
  page?: string;
  limit?: string;
  search?: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  order?: string;
}
