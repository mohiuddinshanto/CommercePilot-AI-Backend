import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../utils/error-handler";

export function validateCategoryInput(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (req.method === "POST") {
    if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
      errors.push({ field: "name", message: "Category name is required." });
    }

    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== "string") {
        errors.push({ field: "description", message: "Description must be a string." });
      }
    }

    if (body.parentId !== undefined && body.parentId !== null) {
      if (typeof body.parentId !== "string") {
        errors.push({ field: "parentId", message: "Parent ID must be a string." });
      }
    }

    if (body.status !== undefined) {
      const allowed = ["active", "draft", "archived"];
      if (!allowed.includes(body.status)) {
        errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}.` });
      }
    }

    if (body.sortOrder !== undefined && body.sortOrder !== null) {
      if (typeof body.sortOrder !== "number" || body.sortOrder < 0 || !Number.isInteger(body.sortOrder)) {
        errors.push({ field: "sortOrder", message: "Sort order must be a non-negative integer." });
      }
    }
  }

  if (req.method === "PATCH") {
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim() === "")) {
      errors.push({ field: "name", message: "Category name must be a non-empty string." });
    }

    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== "string") {
        errors.push({ field: "description", message: "Description must be a string." });
      }
    }

    if (body.parentId !== undefined && body.parentId !== null) {
      if (typeof body.parentId !== "string") {
        errors.push({ field: "parentId", message: "Parent ID must be a string." });
      }
    }

    if (body.status !== undefined) {
      const allowed = ["active", "draft", "archived"];
      if (!allowed.includes(body.status)) {
        errors.push({ field: "status", message: `Status must be one of: ${allowed.join(", ")}.` });
      }
    }

    if (body.sortOrder !== undefined && body.sortOrder !== null) {
      if (typeof body.sortOrder !== "number" || body.sortOrder < 0 || !Number.isInteger(body.sortOrder)) {
        errors.push({ field: "sortOrder", message: "Sort order must be a non-negative integer." });
      }
    }
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}
