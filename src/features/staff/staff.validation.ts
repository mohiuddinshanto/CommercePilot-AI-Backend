import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../utils/error-handler.js";
import { STAFF_PERMISSIONS, STAFF_ROLES } from "../../constants/index.js";
import { EMAIL_REGEX } from "../../utils/helpers.js";

export function validateStaffInput(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (req.method === "POST") {
    if (!body.email || typeof body.email !== "string" || body.email.trim() === "") {
      errors.push({ field: "email", message: "Email is required." });
    } else {
      const emailRegex = EMAIL_REGEX;
      if (!emailRegex.test(body.email.trim())) {
        errors.push({ field: "email", message: "Invalid email address." });
      }
    }

    if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
      errors.push({ field: "name", message: "Name is required." });
    } else if (body.name.trim().length < 2 || body.name.trim().length > 100) {
      errors.push({ field: "name", message: "Name must be between 2 and 100 characters." });
    }

    if (body.role !== undefined) {
      const allowedRoles = Object.values(STAFF_ROLES);
      if (!allowedRoles.includes(body.role)) {
        errors.push({ field: "role", message: `Role must be one of: ${allowedRoles.join(", ")}.` });
      }
    }

    if (!body.permissions || !Array.isArray(body.permissions) || body.permissions.length === 0) {
      errors.push({ field: "permissions", message: "At least one permission is required." });
    } else {
      const allowedPermissions = Object.values(STAFF_PERMISSIONS);
      for (const perm of body.permissions) {
        if (!allowedPermissions.includes(perm)) {
          errors.push({ field: "permissions", message: `Invalid permission: ${perm}.` });
          break;
        }
      }
    }
  }

  if (req.method === "PATCH") {
    if (body.role !== undefined) {
      const allowedRoles = Object.values(STAFF_ROLES);
      if (!allowedRoles.includes(body.role)) {
        errors.push({ field: "role", message: `Role must be one of: ${allowedRoles.join(", ")}.` });
      }
    }

    if (body.permissions !== undefined) {
      if (!Array.isArray(body.permissions) || body.permissions.length === 0) {
        errors.push({ field: "permissions", message: "At least one permission is required." });
      } else {
        const allowedPermissions = Object.values(STAFF_PERMISSIONS);
        for (const perm of body.permissions) {
          if (!allowedPermissions.includes(perm)) {
            errors.push({ field: "permissions", message: `Invalid permission: ${perm}.` });
            break;
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}

export function validateAcceptInvitation(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (!body.token || typeof body.token !== "string" || body.token.trim() === "") {
    errors.push({ field: "token", message: "Invitation token is required." });
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}
