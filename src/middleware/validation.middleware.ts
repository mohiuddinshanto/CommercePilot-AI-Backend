import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../utils/error-handler.js";
import { EMAIL_REGEX } from "../utils/helpers.js";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export function validateObjectId(paramName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const value = String(req.params[paramName] || "");

    if (!value) {
      next(new ValidationError("Missing required parameter.", [
        { field: paramName, message: `${paramName} is required.` },
      ]));
      return;
    }

    if (!OBJECT_ID_REGEX.test(value)) {
      next(new ValidationError("Invalid parameter.", [
        { field: paramName, message: `${paramName} is not a valid ID.` },
      ]));
      return;
    }

    next();
  };
}

export function validateRequiredFields(requiredFields: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const missingFields: { field: string; message: string }[] = [];

    for (const field of requiredFields) {
      const value = req.body[field];

      if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
        missingFields.push({
          field,
          message: `${field} is required.`,
        });
      }
    }

    if (missingFields.length > 0) {
      next(new ValidationError("Validation failed.", missingFields));
      return;
    }

    next();
  };
}

export function validateEnumField(fieldName: string, allowedValues: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const value = req.body[fieldName];

    if (value !== undefined && value !== null && !allowedValues.includes(value)) {
      next(new ValidationError("Validation failed.", [
        {
          field: fieldName,
          message: `${fieldName} must be one of: ${allowedValues.join(", ")}.`,
        },
      ]));
      return;
    }

    next();
  };
}

export function validateNumberRange(fieldName: string, min?: number, max?: number) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const value = req.body[fieldName];

    if (value === undefined || value === null) {
      next();
      return;
    }

    const num = Number(value);

    if (isNaN(num)) {
      next(new ValidationError("Validation failed.", [
        { field: fieldName, message: `${fieldName} must be a number.` },
      ]));
      return;
    }

    if (min !== undefined && num < min) {
      next(new ValidationError("Validation failed.", [
        { field: fieldName, message: `${fieldName} must be at least ${min}.` },
      ]));
      return;
    }

    if (max !== undefined && num > max) {
      next(new ValidationError("Validation failed.", [
        { field: fieldName, message: `${fieldName} must be at most ${max}.` },
      ]));
      return;
    }

    next();
  };
}

export function validateStringLength(fieldName: string, minLength?: number, maxLength?: number) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const value = req.body[fieldName];

    if (value === undefined || value === null) {
      next();
      return;
    }

    if (typeof value !== "string") {
      next(new ValidationError("Validation failed.", [
        { field: fieldName, message: `${fieldName} must be a string.` },
      ]));
      return;
    }

    const trimmed = value.trim();

    if (minLength !== undefined && trimmed.length < minLength) {
      next(new ValidationError("Validation failed.", [
        { field: fieldName, message: `${fieldName} must be at least ${minLength} characters.` },
      ]));
      return;
    }

    if (maxLength !== undefined && trimmed.length > maxLength) {
      next(new ValidationError("Validation failed.", [
        { field: fieldName, message: `${fieldName} must be at most ${maxLength} characters.` },
      ]));
      return;
    }

    next();
  };
}

export function validateEmail(fieldName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const value = req.body[fieldName];

    if (value === undefined || value === null || value === "") {
      next();
      return;
    }

    const emailRegex = EMAIL_REGEX;

    if (!emailRegex.test(String(value))) {
      next(new ValidationError("Validation failed.", [
        { field: fieldName, message: `${fieldName} must be a valid email address.` },
      ]));
      return;
    }

    next();
  };
}

export function validateSortParams(allowedFields: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const sortBy = req.query.sortBy as string | undefined;

    if (sortBy && !allowedFields.includes(sortBy)) {
      next(new ValidationError("Invalid sort parameter.", [
        { field: "sortBy", message: `sortBy must be one of: ${allowedFields.join(", ")}.` },
      ]));
      return;
    }

    const order = req.query.order as string | undefined;

    if (order && !["asc", "desc"].includes(order)) {
      next(new ValidationError("Invalid sort order.", [
        { field: "order", message: "order must be 'asc' or 'desc'." },
      ]));
      return;
    }

    next();
  };
}
