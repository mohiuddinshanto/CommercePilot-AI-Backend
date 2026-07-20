import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../utils/error-handler.js";

export function validateProductInput(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (req.method === "POST") {
    if (!body.sku || typeof body.sku !== "string" || body.sku.trim() === "") {
      errors.push({ field: "sku", message: "SKU is required." });
    }

    if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
      errors.push({ field: "name", message: "Product name is required." });
    }

    if (body.costPrice === undefined || body.costPrice === null) {
      errors.push({ field: "costPrice", message: "Cost price is required." });
    } else if (typeof body.costPrice !== "number" || body.costPrice < 0) {
      errors.push({ field: "costPrice", message: "Cost price must be a non-negative number." });
    }

    if (body.sellingPrice === undefined || body.sellingPrice === null) {
      errors.push({ field: "sellingPrice", message: "Selling price is required." });
    } else if (typeof body.sellingPrice !== "number" || body.sellingPrice < 0) {
      errors.push({ field: "sellingPrice", message: "Selling price must be a non-negative number." });
    }

    if (body.stock === undefined || body.stock === null) {
      errors.push({ field: "stock", message: "Stock is required." });
    } else if (typeof body.stock !== "number" || body.stock < 0 || !Number.isInteger(body.stock)) {
      errors.push({ field: "stock", message: "Stock must be a non-negative integer." });
    }

    if (body.discountPrice !== undefined && body.discountPrice !== null) {
      if (typeof body.discountPrice !== "number" || body.discountPrice < 0) {
        errors.push({ field: "discountPrice", message: "Discount price must be a non-negative number." });
      }
    }

    if (body.lowStockLimit !== undefined && body.lowStockLimit !== null) {
      if (typeof body.lowStockLimit !== "number" || body.lowStockLimit < 0 || !Number.isInteger(body.lowStockLimit)) {
        errors.push({ field: "lowStockLimit", message: "Low stock limit must be a non-negative integer." });
      }
    }

    if (body.images !== undefined && (!Array.isArray(body.images) || body.images.some((image: unknown) => typeof image !== "string"))) {
      errors.push({ field: "images", message: "Images must be a list of URLs." });
    }
    if (body.availableFrom !== undefined && (typeof body.availableFrom !== "string" || Number.isNaN(Date.parse(body.availableFrom)))) {
      errors.push({ field: "availableFrom", message: "Available date must be a valid date." });
    }
    if (body.priority !== undefined && !["low", "medium", "high"].includes(body.priority)) {
      errors.push({ field: "priority", message: "Priority must be low, medium, or high." });
    }
    if (body.status !== undefined) {
      const allowed = ["active", "draft", "archived"];
      if (!allowed.includes(body.status)) {
        errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}.` });
      }
    }
    if (body.shortDescription !== undefined && body.shortDescription !== null) {
      if (typeof body.shortDescription !== "string") {
        errors.push({ field: "shortDescription", message: "Short description must be a string." });
      }
    }
  }

  if (req.method === "PATCH") {
    if (body.sku !== undefined && (typeof body.sku !== "string" || body.sku.trim() === "")) {
      errors.push({ field: "sku", message: "SKU must be a non-empty string." });
    }

    if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim() === "")) {
      errors.push({ field: "name", message: "Product name must be a non-empty string." });
    }

    if (body.costPrice !== undefined && (typeof body.costPrice !== "number" || body.costPrice < 0)) {
      errors.push({ field: "costPrice", message: "Cost price must be a non-negative number." });
    }

    if (body.sellingPrice !== undefined && (typeof body.sellingPrice !== "number" || body.sellingPrice < 0)) {
      errors.push({ field: "sellingPrice", message: "Selling price must be a non-negative number." });
    }

    if (body.stock !== undefined && (typeof body.stock !== "number" || body.stock < 0 || !Number.isInteger(body.stock))) {
      errors.push({ field: "stock", message: "Stock must be a non-negative integer." });
    }

    if (body.discountPrice !== undefined && body.discountPrice !== null) {
      if (typeof body.discountPrice !== "number" || body.discountPrice < 0) {
        errors.push({ field: "discountPrice", message: "Discount price must be a non-negative number." });
      }
    }

    if (body.lowStockLimit !== undefined && body.lowStockLimit !== null) {
      if (typeof body.lowStockLimit !== "number" || body.lowStockLimit < 0 || !Number.isInteger(body.lowStockLimit)) {
        errors.push({ field: "lowStockLimit", message: "Low stock limit must be a non-negative integer." });
      }
    }

    if (body.images !== undefined && (!Array.isArray(body.images) || body.images.some((image: unknown) => typeof image !== "string"))) {
      errors.push({ field: "images", message: "Images must be a list of URLs." });
    }
    if (body.availableFrom !== undefined && (typeof body.availableFrom !== "string" || Number.isNaN(Date.parse(body.availableFrom)))) {
      errors.push({ field: "availableFrom", message: "Available date must be a valid date." });
    }
    if (body.priority !== undefined && !["low", "medium", "high"].includes(body.priority)) {
      errors.push({ field: "priority", message: "Priority must be low, medium, or high." });
    }
    if (body.status !== undefined) {
      const allowed = ["active", "draft", "archived"];
      if (!allowed.includes(body.status)) {
        errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}.` });
      }
    }
    if (body.shortDescription !== undefined && body.shortDescription !== null) {
      if (typeof body.shortDescription !== "string") {
        errors.push({ field: "shortDescription", message: "Short description must be a string." });
      }
    }
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}

