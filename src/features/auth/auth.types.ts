import { ObjectId } from "mongodb";

export interface UserDocument {
  _id: ObjectId;
  storeId?: string;
  name: string;
  email: string;
  image?: string;
  phone?: string;
  role: string;
  accountStatus: string;
  plan?: string;
  emailVerified: boolean;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreDocument {
  _id: ObjectId;
  ownerId: string;
  storeName: string;
  storeSlug: string;
  logo?: string;
  phone?: string;
  email?: string;
  address?: string;
  currency: string;
  timezone: string;
  plan: string;
  accountStatus: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDocument {
  _id: ObjectId;
  userId: string;
  token: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLogDocument {
  _id: ObjectId;
  storeId?: string;
  userId: string;
  action: string;
  module: string;
  description: string;
  ip?: string;
  device?: string;
  createdAt: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface CreateStoreInput {
  storeName: string;
  storeSlug: string;
  currency: string;
  timezone: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  image?: string;
  role: string;
  storeId?: string;
  accountStatus: string;
  plan?: string;
}
