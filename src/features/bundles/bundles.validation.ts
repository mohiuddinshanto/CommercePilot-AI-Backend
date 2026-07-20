import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../utils/error-handler.js";
import { BUNDLE_STATUS } from "../../constants/index.js";

export function validateBundleInput(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (req.method === "POST") {
    if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
      errors.push({ field: "name", message: "Name is required." });
    }

    if (body.bundlePrice === undefined || body.bundlePrice === null) {
      errors.push({ field: "bundlePrice", message: "Bundle price is required." });
    } else if (typeof body.bundlePrice !== "number" || body.bundlePrice < 0) {
      errors.push({ field: "bundlePrice", message: "Bundle price must be a non-negative number." });
    }

    if (!body.products || !Array.isArray(body.products) || body.products.length === 0) {
      errors.push({ field: "products", message: "At least one product is required." });
    } else {
      for (let i = 0; i < body.products.length; i++) {
        const item = body.products[i];
        if (!item.productId || typeof item.productId !== "string" || item.productId.trim() === "") {
          errors.push({ field: `products[${i}].productId`, message: `Product ID is required at index ${i}.` });
        }
        if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 1 || !Number.isInteger(item.quantity)) {
          errors.push({ field: `products[${i}].quantity`, message: `Quantity must be a positive integer at index ${i}.` });
        }
      }
    }

    if (body.status !== undefined) {
      const allowed = Object.values(BUNDLE_STATUS);
      if (!allowed.includes(body.status)) {
        errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}.` });
      }
    }
  }

  if (req.method === "PATCH") {
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim() === "")) {
      errors.push({ field: "name", message: "Name cannot be empty." });
    }

    if (body.bundlePrice !== undefined && (typeof body.bundlePrice !== "number" || body.bundlePrice < 0)) {
      errors.push({ field: "bundlePrice", message: "Bundle price must be a non-negative number." });
    }

    if (body.products !== undefined) {
      if (!Array.isArray(body.products) || body.products.length === 0) {
        errors.push({ field: "products", message: "At least one product is required." });
      } else {
        for (let i = 0; i < body.products.length; i++) {
          const item = body.products[i];
          if (!item.productId || typeof item.productId !== "string" || item.productId.trim() === "") {
            errors.push({ field: `products[${i}].productId`, message: `Product ID is required at index ${i}.` });
          }
          if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 1 || !Number.isInteger(item.quantity)) {
            errors.push({ field: `products[${i}].quantity`, message: `Quantity must be a positive integer at index ${i}.` });
          }
        }
      }
    }

    if (body.status !== undefined) {
      const allowed = Object.values(BUNDLE_STATUS);
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
