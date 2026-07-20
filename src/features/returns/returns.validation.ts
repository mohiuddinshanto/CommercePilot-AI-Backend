import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../utils/error-handler.js";
import { RETURN_STATUS } from "../../constants/index.js";

export function validateReturnInput(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (req.method === "POST") {
    if (!body.saleId || typeof body.saleId !== "string") {
      errors.push({ field: "saleId", message: "Sale ID is required." });
    }

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      errors.push({ field: "items", message: "At least one item is required." });
    } else {
      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i];
        if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 1 || !Number.isInteger(item.quantity)) {
          errors.push({ field: `items[${i}].quantity`, message: `Quantity must be a positive integer at index ${i}.` });
        }
        if (item.unitPrice === undefined || item.unitPrice === null || typeof item.unitPrice !== "number" || item.unitPrice < 0) {
          errors.push({ field: `items[${i}].unitPrice`, message: `Unit price must be a non-negative number at index ${i}.` });
        }
        if (item.refundAmount !== undefined && (typeof item.refundAmount !== "number" || item.refundAmount < 0)) {
          errors.push({ field: `items[${i}].refundAmount`, message: `Refund amount must be a non-negative number at index ${i}.` });
        }
        if (!item.productId && !item.bundleId) {
          errors.push({ field: `items[${i}]`, message: `Each item must have productId or bundleId at index ${i}.` });
        }
      }
    }
  }

  if (req.method === "PATCH") {
    if (body.status !== undefined) {
      const allowed = Object.values(RETURN_STATUS);
      if (!allowed.includes(body.status)) {
        errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}.` });
      }
    }
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}
