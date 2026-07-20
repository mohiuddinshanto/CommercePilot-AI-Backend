import { ObjectId } from "mongodb";

export interface ProductDocument {
  _id: ObjectId;
  storeId: string;
  categoryId?: string;
  sku: string;
  barcode?: string;
  name: string;
  slug: string;
  description?: string;
  images: string[];
  costPrice: number;
  sellingPrice: number;
  discountPrice?: number;
  stock: number;
  lowStockLimit: number;
  status: string;
  tags: string[];
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductInput {
  categoryId?: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  images?: string[];
  costPrice: number;
  sellingPrice: number;
  discountPrice?: number;
  stock: number;
  lowStockLimit?: number;
  status?: string;
  tags?: string[];
}

export interface UpdateProductInput {
  categoryId?: string;
  sku?: string;
  barcode?: string;
  name?: string;
  description?: string;
  images?: string[];
  costPrice?: number;
  sellingPrice?: number;
  discountPrice?: number;
  stock?: number;
  lowStockLimit?: number;
  status?: string;
  tags?: string[];
}

export interface ProductQueryParams {
  page?: string;
  limit?: string;
  search?: string;
  status?: string;
  categoryId?: string;
  sortBy?: string;
  order?: string;
}
