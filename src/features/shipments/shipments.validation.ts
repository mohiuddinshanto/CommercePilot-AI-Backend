import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../utils/error-handler.js";
import { COURIER_NAMES, SHIPMENT_STATUS } from "../../constants/index.js";

export function validateCreateShipment(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (!body.saleId || typeof body.saleId !== "string") {
    errors.push({ field: "saleId", message: "Sale ID is required." });
  }

  const allowedCouriers = Object.values(COURIER_NAMES);
  if (!body.courier || !allowedCouriers.includes(body.courier)) {
    errors.push({ field: "courier", message: `Courier must be one of: ${allowedCouriers.join(", ")}.` });
  }

  if (!body.deliveryAddress || typeof body.deliveryAddress !== "string" || body.deliveryAddress.length < 5) {
    errors.push({ field: "deliveryAddress", message: "Delivery address is required and must be at least 5 characters." });
  }

  if (!body.deliveryPhone || typeof body.deliveryPhone !== "string" || body.deliveryPhone.length < 8) {
    errors.push({ field: "deliveryPhone", message: "Delivery phone is required and must be at least 8 characters." });
  }

  if (body.codAmount !== undefined && (typeof body.codAmount !== "number" || body.codAmount < 0)) {
    errors.push({ field: "codAmount", message: "COD amount must be a non-negative number." });
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}

export function validateUpdateShipment(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (body.status !== undefined) {
    const allowedStatuses = Object.values(SHIPMENT_STATUS);
    if (!allowedStatuses.includes(body.status)) {
      errors.push({ field: "status", message: `Status must be one of: ${allowedStatuses.join(", ")}.` });
    }
  }

  if (body.codReceived !== undefined && typeof body.codReceived !== "boolean") {
    errors.push({ field: "codReceived", message: "codReceived must be a boolean." });
  }

  if (body.deliveryAddress !== undefined && (typeof body.deliveryAddress !== "string" || body.deliveryAddress.length < 5)) {
    errors.push({ field: "deliveryAddress", message: "Delivery address must be at least 5 characters." });
  }

  if (body.deliveryPhone !== undefined && (typeof body.deliveryPhone !== "string" || body.deliveryPhone.length < 8)) {
    errors.push({ field: "deliveryPhone", message: "Delivery phone must be at least 8 characters." });
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}
