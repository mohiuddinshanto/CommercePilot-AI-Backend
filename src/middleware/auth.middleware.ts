import { Request, Response, NextFunction } from "express";
import { getAuth } from "../config/auth";
import { getAuthRepository } from "../features/auth/auth.repository";
import { getStaffRepository } from "../features/staff/staff.repository";
import {
  AuthenticationError,
  AuthorizationError,
  AccountPendingError,
  AccountRejectedError,
  AccountSuspendedError,
  NotFoundError,
  AppError,
} from "../utils/error-handler";
import { logger } from "../utils/logger";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  storeId?: string;
  accountStatus: string;
  plan?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      session?: Record<string, unknown>;
    }
  }
}

/**
 * Multi-Tenant Security Layer
 *
 * Every business route MUST use this middleware chain:
 *   requireAuth() → requireStoreAccess() → requireStoreApproved() → [requirePermission()]
 *
 * Rules:
 *   1. storeId is ALWAYS derived from req.user (set by requireAuth from the DB), NEVER from req.body/params/query
 *   2. Owner/staff can only access their own store's data
 *   3. Super Admin bypasses store filtering only through dedicated admin endpoints
 *   4. Staff must also have the required permission via requirePermission()
 */

export function requireAuth() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = getAuth();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session: any = await auth.api.getSession({
        headers: req.headers as Record<string, string>,
      });

      if (!session || !session.user) {
        throw new AuthenticationError();
      }

      const userData = session.user as { id: string };
      const authRepository = getAuthRepository();
      const user = await authRepository.findUserById(userData.id);

      if (!user) {
        throw new AuthenticationError("User not found.");
      }

      if (user.accountStatus === "rejected") {
        throw new AccountRejectedError();
      }

      if (user.accountStatus === "suspended") {
        throw new AccountSuspendedError();
      }

      req.user = {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role || "owner",
        storeId: user.storeId,
        accountStatus: user.accountStatus,
        plan: user.plan,
      };

      req.session = session as unknown as Record<string, unknown>;

      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error("Authentication middleware error", error);
        next(new AuthenticationError());
      }
    }
  };
}

/**
 * Ensures the authenticated user has a valid storeId.
 * Owner and staff MUST have a storeId. Super Admin may optionally have one.
 * storeId is always derived from req.user.storeId — never from the request.
 */
export function requireStoreAccess() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError());
      return;
    }

    if (req.user.role === "super_admin") {
      next();
      return;
    }

    if (!req.user.storeId) {
      next(new AuthorizationError("No store associated with your account. Please create a store first."));
      return;
    }

    next();
  };
}

/**
 * Checks that the user's store is approved.
 * Must be used AFTER requireAuth() and requireStoreAccess().
 * Super Admin bypasses this check.
 */
export function requireStoreApproved() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(new AuthenticationError());
      return;
    }

    if (req.user.role === "super_admin") {
      next();
      return;
    }

    if (!req.user.storeId) {
      next(new AuthorizationError("No store associated with your account."));
      return;
    }

    try {
      const authRepository = getAuthRepository();
      const store = await authRepository.getStore(req.user.storeId);

      if (!store) {
        next(new NotFoundError("Store"));
        return;
      }

      if (store.accountStatus === "pending") {
        next(new AccountPendingError("Your store is awaiting approval."));
        return;
      }

      if (store.accountStatus === "rejected") {
        next(new AccountRejectedError("Your store has been rejected."));
        return;
      }

      if (store.accountStatus === "suspended") {
        next(new AccountSuspendedError("Your store has been suspended."));
        return;
      }

      if (!store.isActive) {
        next(new AuthorizationError("Your store is inactive."));
        return;
      }

      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error("Store approval check error", error);
        next(new AuthorizationError());
      }
    }
  };
}

export function requirePermission(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        next(new AuthenticationError());
        return;
      }

      if (req.user.role === "owner" || req.user.role === "super_admin") {
        next();
        return;
      }

      if (req.user.role === "staff" && req.user.storeId) {
        const staffRepository = getStaffRepository();
        const staffMember = await staffRepository.findByUserId(
          req.user.storeId,
          req.user.id
        );

        if (!staffMember || !staffMember.permissions?.includes(permission)) {
          next(new AuthorizationError("You do not have the required permission."));
          return;
        }
      }

      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error("Permission middleware error", error);
        next(new AuthorizationError());
      }
    }
  };
}

export function requireAccountApproved() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError());
      return;
    }

    if (req.user.accountStatus !== "approved") {
      if (req.user.accountStatus === "pending") {
        next(new AccountPendingError());
      } else if (req.user.accountStatus === "rejected") {
        next(new AccountRejectedError());
      } else if (req.user.accountStatus === "suspended") {
        next(new AccountSuspendedError());
      } else {
        next(new AuthorizationError(`Your account has been ${req.user.accountStatus}.`));
      }
      return;
    }

    next();
  };
}
