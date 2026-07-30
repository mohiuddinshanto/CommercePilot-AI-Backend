import { ObjectId } from "mongodb";

export interface ShipmentStatusHistory {
  status: string;
  timestamp: Date;
}

export interface ShipmentDocument {
  _id: ObjectId;
  storeId: string;
  saleId: ObjectId;
  courier: string;
  consignmentId: string;
  status: string;
  codAmount: number;
  codReceived: boolean;
  deliveryAddress: string;
  deliveryPhone: string;
  statusHistory: ShipmentStatusHistory[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
}

export interface CreateShipmentInput {
  saleId: string;
  courier: string;
  deliveryAddress: string;
  deliveryPhone: string;
  codAmount?: number;
}

export interface UpdateShipmentInput {
  status?: string;
  codReceived?: boolean;
  consignmentId?: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
}
