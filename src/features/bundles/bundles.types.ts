import { ObjectId } from "mongodb";

export interface BundleProductItem {
  productId: ObjectId;
  quantity: number;
}

export interface BundleDocument {
  _id: ObjectId;
  storeId: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  products: BundleProductItem[];
  originalPrice: number;
  bundlePrice: number;
  discountAmount: number;
  discountPercentage: number;
  status: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBundleInput {
  name: string;
  description?: string;
  image?: string;
  products: { productId: string; quantity: number }[];
  bundlePrice: number;
  status?: string;
}

export interface UpdateBundleInput {
  name?: string;
  description?: string;
  image?: string;
  products?: { productId: string; quantity: number }[];
  bundlePrice?: number;
  status?: string;
}

export interface BundleQueryParams {
  page?: string;
  limit?: string;
  search?: string;
  status?: string;
  sortBy?: string;
  order?: string;
}
