import { ObjectId } from "mongodb";
import { getShipmentRepository } from "./shipments.repository.js";
import { getSaleRepository } from "../sales/sales.repository.js";
import { getAuthRepository } from "../auth/auth.repository.js";
import { CreateShipmentInput, UpdateShipmentInput, ShipmentDocument } from "./shipments.types.js";
import { NotFoundError, BusinessRuleError, ValidationError } from "../../utils/error-handler.js";
import { parsePaginationParams } from "../../utils/pagination.js";
import { ACTIVITY_ACTION, SHIPMENT_STATUS, COURIER_NAMES } from "../../constants/index.js";
import { roundCurrency } from "../../utils/helpers.js";
import https from "https";

export class ShipmentService {
  private shipmentRepo = getShipmentRepository();
  private saleRepo = getSaleRepository();
  private authRepository = getAuthRepository();

  private async callSteadfastApi(
    endpoint: string,
    method: string,
    body?: unknown
  ): Promise<unknown> {
    const apiKey = process.env.STEADFAST_API_KEY || "";
    const secretKey = process.env.STEADFAST_SECRET_KEY || "";
    const baseUrl = "https://portal.steadfast.com.bd/api/v1";

    return new Promise((resolve, reject) => {
      const url = new URL(`${baseUrl}${endpoint}`);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          "Api-Key": apiKey,
          "Secret-Key": secretKey,
          "Content-Type": "application/json",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      });

      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async createShipment(
    storeId: string,
    userId: string,
    input: CreateShipmentInput
  ): Promise<ShipmentDocument> {
    const sale = await this.saleRepo.findByIdAndStoreId(input.saleId, storeId);
    if (!sale) {
      throw new NotFoundError("Sale not found.");
    }

    const existingShipments = await this.shipmentRepo.findBySaleId(storeId, input.saleId);
    if (existingShipments.some((s) => s.status !== SHIPMENT_STATUS.CANCELLED && s.status !== SHIPMENT_STATUS.RETURNED)) {
      throw new BusinessRuleError("An active shipment already exists for this sale.");
    }

    const now = new Date().toISOString();
    let consignmentId = "";

    if (input.courier === COURIER_NAMES.STEADFAST) {
      try {
        const response: any = await this.callSteadfastApi("/create_order", "POST", {
          invoice: sale.invoiceNumber,
          recipient_name: sale.customerName,
          recipient_phone: input.deliveryPhone || sale.customerPhone,
          recipient_address: input.deliveryAddress,
          cod_amount: input.codAmount ?? sale.dueAmount,
          note: `Sale ${sale.invoiceNumber}`,
        });

        if (response?.status === 200 && response?.data?.consignment_id) {
          consignmentId = String(response.data.consignment_id);
        }
      } catch (err) {
        throw new BusinessRuleError(`Steadfast API error: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    const shipmentData: Omit<ShipmentDocument, "_id"> = {
      storeId,
      saleId: new ObjectId(input.saleId),
      courier: input.courier,
      consignmentId,
      status: SHIPMENT_STATUS.PENDING,
      codAmount: roundCurrency(input.codAmount ?? sale.dueAmount),
      codReceived: false,
      deliveryAddress: input.deliveryAddress,
      deliveryPhone: input.deliveryPhone || sale.customerPhone,
      statusHistory: [{ status: SHIPMENT_STATUS.PENDING, timestamp: new Date() }],
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    const shipment = await this.shipmentRepo.create(shipmentData);

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.CREATE_SALE,
      module: "shipments",
      description: `Shipment created for invoice ${sale.invoiceNumber}. Courier: ${input.courier}.${consignmentId ? ` Consignment: ${consignmentId}.` : ""}`,
      createdAt: now,
    });

    return shipment;
  }

  async getShipments(storeId: string, queryParams: Record<string, string>) {
    const { page, limit, skip } = parsePaginationParams(queryParams);

    const sort: Record<string, 1 | -1> = { createdAt: -1 };

    const { items, total } = await this.shipmentRepo.findByStoreId(storeId, {
      skip,
      limit,
      saleId: queryParams.saleId,
      status: queryParams.status,
      courier: queryParams.courier,
      sort,
    });

    return {
      items,
      page,
      pageSize: limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getShipmentById(storeId: string, id: string): Promise<ShipmentDocument> {
    const shipment = await this.shipmentRepo.findByIdAndStoreId(id, storeId);
    if (!shipment) {
      throw new NotFoundError("Shipment not found.");
    }
    return shipment;
  }

  async updateShipment(
    storeId: string,
    userId: string,
    id: string,
    input: UpdateShipmentInput
  ): Promise<ShipmentDocument> {
    const existing = await this.shipmentRepo.findByIdAndStoreId(id, storeId);
    if (!existing) {
      throw new NotFoundError("Shipment not found.");
    }

    const updateData: Record<string, unknown> = {};

    if (input.status !== undefined) {
      const allowedStatuses = Object.values(SHIPMENT_STATUS);
      if (!allowedStatuses.includes(input.status as never)) {
        throw new ValidationError("Validation failed.", [
          { field: "status", message: `Status must be one of: ${allowedStatuses.join(", ")}.` },
        ]);
      }
    }

    if (input.status) {
      await this.shipmentRepo.updateStatus(id, storeId, input.status);
      if (input.status === SHIPMENT_STATUS.DELIVERED) {
        const sale = await this.saleRepo.findByIdAndStoreId(existing.saleId.toString(), storeId);
        if (sale) {
          const newPaid = sale.paidAmount + existing.codAmount;
          const newDue = Math.max(0, sale.grandTotal - newPaid);
          await this.saleRepo.update(sale._id.toString(), storeId, {
            paidAmount: newPaid,
            dueAmount: newDue,
            paymentStatus: newDue <= 0 ? "paid" : sale.paymentStatus === "paid" ? "paid" : "partial",
          });
        }
      }
      if (input.status === SHIPMENT_STATUS.CANCELLED || input.status === SHIPMENT_STATUS.RETURNED) {
        await this.restoreInventoryOnReturn(storeId, userId, existing);
      }
    }

    if (input.codReceived !== undefined) {
      updateData.codReceived = input.codReceived;
    }
    if (input.consignmentId !== undefined) {
      updateData.consignmentId = input.consignmentId;
    }
    if (input.deliveryAddress !== undefined) {
      updateData.deliveryAddress = input.deliveryAddress;
    }
    if (input.deliveryPhone !== undefined) {
      updateData.deliveryPhone = input.deliveryPhone;
    }

    updateData.updatedBy = userId;

    if (Object.keys(updateData).length > 0) {
      await this.shipmentRepo.update(id, storeId, updateData);
    }

    const updated = await this.shipmentRepo.findByIdAndStoreId(id, storeId);
    if (!updated) throw new NotFoundError("Shipment not found.");

    await this.authRepository.createActivityLog({
      storeId,
      userId,
      action: ACTIVITY_ACTION.UPDATE_SALE,
      module: "shipments",
      description: `Shipment ${existing.consignmentId || existing._id.toString()} updated. Status: ${updated.status}.`,
      createdAt: new Date().toISOString(),
    });

    return updated;
  }

  private async restoreInventoryOnReturn(
    storeId: string,
    userId: string,
    shipment: ShipmentDocument
  ): Promise<void> {
    const { getProductRepository } = await import("../products/product.repository.js");
    const { getInventoryRepository } = await import("../inventory/inventory.repository.js");
    const productRepo = getProductRepository();
    const inventoryRepo = getInventoryRepository();

    const sale = await this.saleRepo.findByIdAndStoreId(shipment.saleId.toString(), storeId);
    if (!sale) return;

    for (const item of sale.items) {
      const pid = item.productId?.toString();
      if (!pid) continue;

      const product = await productRepo.findByIdAndStoreId(pid, storeId);
      if (!product) continue;

      const newStock = product.stock + item.quantity;
      await productRepo.update(pid, storeId, { stock: newStock });

      const invs = await inventoryRepo.findByProductIds(new ObjectId(storeId), [new ObjectId(pid)]);
      const inv = invs[0];
      if (inv) {
        await inventoryRepo.update(inv._id, new ObjectId(storeId), {
          $set: {
            currentStock: newStock,
            availableStock: newStock - inv.reservedStock,
          },
        });
        await inventoryRepo.createMovement({
          storeId: new ObjectId(storeId),
          inventoryId: inv._id,
          productId: new ObjectId(pid),
          type: "return",
          quantity: item.quantity,
          previousStock: product.stock,
          newStock,
          reference: shipment._id.toString(),
          notes: `Shipment returned/cancelled - ${shipment.consignmentId || ""}`,
          createdBy: new ObjectId(userId),
        });
      }
    }
  }

  async deleteShipment(storeId: string, userId: string, id: string): Promise<void> {
    const existing = await this.shipmentRepo.findByIdAndStoreId(id, storeId);
    if (!existing) throw new NotFoundError("Shipment not found.");
    await this.shipmentRepo.softDelete(id, storeId, userId);
  }

  async getShipmentsBySale(storeId: string, saleId: string): Promise<ShipmentDocument[]> {
    return this.shipmentRepo.findBySaleId(storeId, saleId);
  }
}

let instance: ShipmentService | null = null;

export function getShipmentService(): ShipmentService {
  if (!instance) {
    instance = new ShipmentService();
  }
  return instance;
}
