import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../utils/error-handler.js";
import { RETURN_STATUS, RETURN_TYPE } from "../../constants/index.js";

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

    const allowedTypes = Object.values(RETURN_TYPE);
    if (!body.returnType || !allowedTypes.includes(body.returnType)) {
      errors.push({ field: "returnType", message: `Return type must be one of: ${allowedTypes.join(", ")}.` });
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

    if (body.returnType === RETURN_TYPE.DIFFERENT_EXCHANGE) {
      if (!body.exchangeItems || !Array.isArray(body.exchangeItems) || body.exchangeItems.length === 0) {
        errors.push({ field: "exchangeItems", message: "Exchange items are required for different product exchange." });
      } else {
        for (let i = 0; i < body.exchangeItems.length; i++) {
          const ex = body.exchangeItems[i];
          if (!ex.productId) {
            errors.push({ field: `exchangeItems[${i}].productId`, message: `Product ID is required at index ${i}.` });
          }
          if (!ex.name) {
            errors.push({ field: `exchangeItems[${i}].name`, message: `Product name is required at index ${i}.` });
          }
          if (!ex.quantity || typeof ex.quantity !== "number" || ex.quantity < 1 || !Number.isInteger(ex.quantity)) {
            errors.push({ field: `exchangeItems[${i}].quantity`, message: `Quantity must be a positive integer at index ${i}.` });
          }
          if (ex.unitPrice === undefined || typeof ex.unitPrice !== "number" || ex.unitPrice < 0) {
            errors.push({ field: `exchangeItems[${i}].unitPrice`, message: `Unit price must be a non-negative number at index ${i}.` });
          }
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
