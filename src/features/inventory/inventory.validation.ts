import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../utils/error-handler";

export function validateInventoryInput(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (req.method === "POST") {
    if (!body.productId || typeof body.productId !== "string" || body.productId.trim() === "") {
      errors.push({ field: "productId", message: "Product ID is required." });
    }

    if (body.currentStock === undefined || body.currentStock === null) {
      errors.push({ field: "currentStock", message: "Current stock is required." });
    } else if (typeof body.currentStock !== "number" || body.currentStock < 0 || !Number.isInteger(body.currentStock)) {
      errors.push({ field: "currentStock", message: "Current stock must be a non-negative integer." });
    }

    if (body.costPrice === undefined || body.costPrice === null) {
      errors.push({ field: "costPrice", message: "Cost price is required." });
    } else if (typeof body.costPrice !== "number" || body.costPrice < 0) {
      errors.push({ field: "costPrice", message: "Cost price must be a non-negative number." });
    }

    if (body.lowStockLimit !== undefined && body.lowStockLimit !== null) {
      if (typeof body.lowStockLimit !== "number" || body.lowStockLimit < 0 || !Number.isInteger(body.lowStockLimit)) {
        errors.push({ field: "lowStockLimit", message: "Low stock limit must be a non-negative integer." });
      }
    }
  }

  if (req.method === "PATCH") {
    if (body.productId !== undefined) {
      errors.push({ field: "productId", message: "Product ID cannot be updated." });
    }

    if (body.currentStock !== undefined && (typeof body.currentStock !== "number" || body.currentStock < 0 || !Number.isInteger(body.currentStock))) {
      errors.push({ field: "currentStock", message: "Current stock must be a non-negative integer." });
    }

    if (body.costPrice !== undefined && (typeof body.costPrice !== "number" || body.costPrice < 0)) {
      errors.push({ field: "costPrice", message: "Cost price must be a non-negative number." });
    }

    if (body.lowStockLimit !== undefined && body.lowStockLimit !== null) {
      if (typeof body.lowStockLimit !== "number" || body.lowStockLimit < 0 || !Number.isInteger(body.lowStockLimit)) {
        errors.push({ field: "lowStockLimit", message: "Low stock limit must be a non-negative integer." });
      }
    }
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}

export function validateStockMovementInput(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (body.quantity === undefined || body.quantity === null) {
    errors.push({ field: "quantity", message: "Quantity is required." });
  } else if (typeof body.quantity !== "number" || body.quantity <= 0 || !Number.isInteger(body.quantity)) {
    errors.push({ field: "quantity", message: "Quantity must be a positive integer." });
  }

  if (body.reference !== undefined && body.reference !== null) {
    if (typeof body.reference !== "string" || body.reference.trim() === "") {
      errors.push({ field: "reference", message: "Reference must be a non-empty string." });
    }
  }

  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string" || body.notes.trim() === "") {
      errors.push({ field: "notes", message: "Notes must be a non-empty string." });
    }
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}
