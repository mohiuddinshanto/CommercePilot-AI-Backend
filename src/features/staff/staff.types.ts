import { ObjectId } from "mongodb";

export interface StaffMemberDocument {
  _id: ObjectId;
  storeId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  status: "pending" | "active" | "suspended";
  invitationToken: string;
  invitationExpiresAt: string;
  invitedBy: string;
  suspendedAt?: string;
  suspendedBy?: string;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InviteStaffInput {
  email: string;
  name: string;
  role?: string;
  permissions: string[];
}

export interface UpdateStaffInput {
  role?: string;
  permissions?: string[];
}

export interface StaffQueryParams {
  page?: string;
  limit?: string;
  search?: string;
  status?: string;
  role?: string;
  sortBy?: string;
  order?: string;
}
