/**
 * MULTI-TENANT ARCHITECTURE RULES
 * ================================
 *
 * Every business feature MUST follow these rules. No exceptions.
 *
 *
 * 1. storeId SOURCE
 * -----------------
 * storeId is ALWAYS derived from req.user.storeId (set by requireAuth from DB).
 * NEVER accept storeId from req.body, req.params, or req.query.
 *
 *   // CORRECT
 *   const storeId = getStoreId(req);
 *
 *   // WRONG — never do this
 *   const storeId = req.body.storeId;
 *   const storeId = req.params.storeId;
 *
 *
 * 2. MIDDLEWARE CHAIN
 * -------------------
 * Every business route MUST use this chain:
 *
 *   requireAuth()
 *   → requireStoreAccess()
 *   → requireStoreApproved()
 *   → [requirePermission("permission_name")]
 *   → controller
 *
 * Example:
 *   router.get(
 *     "/products",
 *     requireAuth(),
 *     requireStoreAccess(),
 *     requireStoreApproved(),
 *     requirePermission("products"),
 *     (req, res, next) => controller.list(req, res, next)
 *   );
 *
 *
 * 3. REPOSITORY PATTERN
 * ---------------------
 * Every repository query MUST include { storeId } in the filter.
 *
 *   // CORRECT
 *   async findByStoreId(storeId: string) {
 *     return this.db.collection(COLLECTIONS.PRODUCTS)
 *       .find({ storeId })
 *       .toArray();
 *   }
 *
 *   // WRONG — missing storeId
 *   async findAll() {
 *     return this.db.collection(COLLECTIONS.PRODUCTS)
 *       .find({})
 *       .toArray();
 *   }
 *
 *
 * 4. SUPER ADMIN ACCESS
 * ---------------------
 * Super Admin can access all stores ONLY through dedicated admin routes.
 * Admin routes use requireSuperAdmin() middleware and getAdminStoreFilter().
 *
 *   // Admin endpoint: access ALL stores
 *   router.get(
 *     "/admin/products",
 *     requireAuth(),
 *     requireSuperAdmin(),
 *     (req, res, next) => controller.adminList(req, res, next)
 *   );
 *
 *   // In controller:
 *   const storeId = getAdminStoreFilter(req); // returns undefined for super_admin
 *   const query = storeId ? { storeId } : {}; // empty = all stores
 *
 *
 * 5. OWNER vs STAFF
 * -----------------
 * - Owner: full access to their store (no permission check needed)
 * - Staff: limited by permissions array (checked by requirePermission())
 * - Both are scoped to their store via storeId
 *
 *
 * 6. COLLECTIONS WITH storeId
 * ---------------------------
 * All business collections MUST have a storeId field:
 *   - products
 *   - categories
 *   - inventory
 *   - bundles
 *   - sales
 *   - returns
 *   - customers
 *   - staff
 *   - reports
 *   - ai_conversations
 *   - subscriptions
 *   - activity_logs
 *
 * Collections WITHOUT storeId (platform-level):
 *   - user (has storeId as a field, but is the user record itself)
 *   - session
 *   - account
 *   - verification
 *   - system_settings
 */
export {};
