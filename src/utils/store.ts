import { Request } from "express";
import { AuthorizationError } from "./error-handler.js";

/**
 * Extracts storeId from the authenticated user on the request.
 *
 * CRITICAL: storeId is ALWAYS derived from the session/user in the database.
 * NEVER accept storeId from req.body, req.params, or req.query.
 *
 * Usage in controllers:
 *   const storeId = getStoreId(req);
 *   const products = await repository.findByStoreId(storeId);
 *
 * For super admin endpoints that need to access any store:
 *   const storeId = getStoreId(req, { allowSuperAdmin: true });
 */
export function getStoreId(
  req: Request,
  options?: { allowSuperAdmin?: boolean }
): string {
  if (!req.user) {
    throw new AuthorizationError("Authentication required.");
  }

  if (options?.allowSuperAdmin && req.user.role === "super_admin") {
    const storeId = req.user.storeId;
    if (!storeId) {
      throw new AuthorizationError("No store specified. Provide a storeId parameter.");
    }
    return storeId;
  }

  if (!req.user.storeId) {
    throw new AuthorizationError("No store associated with your account.");
  }

  return req.user.storeId;
}

/**
 * For super admin endpoints that access ALL stores (not just one).
 * Returns undefined to signal "no store filter — query all stores".
 *
 * Usage:
 *   const storeId = getAdminStoreFilter(req);
 *   // storeId is either the user's own storeId or undefined (all stores)
 *   const query = storeId ? { storeId } : {};
 *   const items = await collection.find(query).toArray();
 */
export function getAdminStoreFilter(
  req: Request
): string | undefined {
  if (!req.user) {
    throw new AuthorizationError("Authentication required.");
  }

  if (req.user.role === "super_admin") {
    return undefined; // no filter — access all stores
  }

  if (!req.user.storeId) {
    throw new AuthorizationError("No store associated with your account.");
  }

  return req.user.storeId;
}
