import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../utils/error-handler.js";
import { PAYMENT_METHOD, PAYMENT_STATUS, SALE_STATUS } from "../../constants/index.js";

export function validateSaleInput(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (req.method === "POST") {
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      errors.push({ field: "items", message: "At least one item is required." });
    } else {
      for (let i = 0; i < body.items.length; i++) {
        const item = body.items[i];
        if (!item.name || typeof item.name !== "string" || item.name.trim() === "") {
          errors.push({ field: `items[${i}].name`, message: `Name is required at index ${i}.` });
        }
        if (!item.sku || typeof item.sku !== "string" || item.sku.trim() === "") {
          errors.push({ field: `items[${i}].sku`, message: `SKU is required at index ${i}.` });
        }
        if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 1 || !Number.isInteger(item.quantity)) {
          errors.push({ field: `items[${i}].quantity`, message: `Quantity must be a positive integer at index ${i}.` });
        }
        if (item.unitPrice === undefined || item.unitPrice === null || typeof item.unitPrice !== "number" || item.unitPrice < 0) {
          errors.push({ field: `items[${i}].unitPrice`, message: `Unit price must be a non-negative number at index ${i}.` });
        }
        if (!item.productId && !item.bundleId) {
          errors.push({ field: `items[${i}]`, message: `Each item must have productId or bundleId at index ${i}.` });
        }
      }
    }

    if (!body.paymentMethod || typeof body.paymentMethod !== "string") {
      errors.push({ field: "paymentMethod", message: "Payment method is required." });
    } else {
      const allowed = Object.values(PAYMENT_METHOD);
      if (!allowed.includes(body.paymentMethod)) {
        errors.push({ field: "paymentMethod", message: `Payment method must be one of: ${allowed.join(", ")}.` });
      }
    }

    if (body.paidAmount === undefined || body.paidAmount === null) {
      errors.push({ field: "paidAmount", message: "Paid amount is required." });
    } else if (typeof body.paidAmount !== "number" || body.paidAmount < 0) {
      errors.push({ field: "paidAmount", message: "Paid amount must be a non-negative number." });
    }

    if (body.discount !== undefined && (typeof body.discount !== "number" || body.discount < 0)) {
      errors.push({ field: "discount", message: "Discount must be a non-negative number." });
    }
    if (body.tax !== undefined && (typeof body.tax !== "number" || body.tax < 0)) {
      errors.push({ field: "tax", message: "Tax must be a non-negative number." });
    }
    if (body.shipping !== undefined && (typeof body.shipping !== "number" || body.shipping < 0)) {
      errors.push({ field: "shipping", message: "Shipping must be a non-negative number." });
    }
  }

  if (req.method === "PATCH") {
    if (body.paymentMethod !== undefined) {
      const allowed = Object.values(PAYMENT_METHOD);
      if (!allowed.includes(body.paymentMethod)) {
        errors.push({ field: "paymentMethod", message: `Payment method must be one of: ${allowed.join(", ")}.` });
      }
    }

    if (body.paymentStatus !== undefined) {
      const allowed = Object.values(PAYMENT_STATUS);
      if (!allowed.includes(body.paymentStatus)) {
        errors.push({ field: "paymentStatus", message: `Payment status must be one of: ${allowed.join(", ")}.` });
      }
    }

    if (body.status !== undefined) {
      const allowed = Object.values(SALE_STATUS);
      if (!allowed.includes(body.status)) {
        errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}.` });
      }
    }

    if (body.paidAmount !== undefined && (typeof body.paidAmount !== "number" || body.paidAmount < 0)) {
      errors.push({ field: "paidAmount", message: "Paid amount must be a non-negative number." });
    }

    if (body.discount !== undefined && (typeof body.discount !== "number" || body.discount < 0)) {
      errors.push({ field: "discount", message: "Discount must be a non-negative number." });
    }
    if (body.tax !== undefined && (typeof body.tax !== "number" || body.tax < 0)) {
      errors.push({ field: "tax", message: "Tax must be a non-negative number." });
    }
    if (body.shipping !== undefined && (typeof body.shipping !== "number" || body.shipping < 0)) {
      errors.push({ field: "shipping", message: "Shipping must be a non-negative number." });
    }
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}
