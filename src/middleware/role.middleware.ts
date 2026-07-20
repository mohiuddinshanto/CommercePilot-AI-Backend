import { Request, Response, NextFunction } from "express";
import { AuthorizationError } from "../utils/error-handler";

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthorizationError("Authentication required."));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new AuthorizationError());
      return;
    }

    next();
  };
}

export function requireOwnerOrStaff() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthorizationError("Authentication required."));
      return;
    }

    if (req.user.role !== "owner" && req.user.role !== "staff") {
      next(new AuthorizationError());
      return;
    }

    next();
  };
}

export function requireSuperAdmin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthorizationError("Authentication required."));
      return;
    }

    if (req.user.role !== "super_admin") {
      next(new AuthorizationError("Super admin access required."));
      return;
    }

    next();
  };
}
