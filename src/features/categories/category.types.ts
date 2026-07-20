import { ObjectId } from "mongodb";

export interface CategoryDocument {
  _id: ObjectId;
  storeId: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  status: string;
  sortOrder: number;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
  parentId?: string;
  status?: string;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  parentId?: string;
  status?: string;
  sortOrder?: number;
}

export interface CategoryQueryParams {
  page?: string;
  limit?: string;
  search?: string;
  status?: string;
  sortBy?: string;
  order?: string;
}
