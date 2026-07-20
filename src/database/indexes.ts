import { Db } from "mongodb";
import { COLLECTIONS } from "../constants/index.js";
import { logger } from "../utils/logger.js";

interface IndexDefinition {
  collection: string;
  index: Record<string, 1 | -1>;
  options?: Record<string, unknown>;
}

const INDEXES: IndexDefinition[] = [
  // ── user ──
  { collection: COLLECTIONS.USERS, index: { email: 1 }, options: { unique: true } },
  { collection: COLLECTIONS.USERS, index: { role: 1 } },
  { collection: COLLECTIONS.USERS, index: { accountStatus: 1 } },
  { collection: COLLECTIONS.USERS, index: { storeId: 1 } },

  // ── stores ──
  { collection: COLLECTIONS.STORES, index: { ownerId: 1 } },
  { collection: COLLECTIONS.STORES, index: { storeSlug: 1 }, options: { unique: true } },
  { collection: COLLECTIONS.STORES, index: { plan: 1 } },
  { collection: COLLECTIONS.STORES, index: { accountStatus: 1 } },

  // ── products ──
  { collection: COLLECTIONS.PRODUCTS, index: { storeId: 1, isDeleted: 1, createdAt: -1 } },
  { collection: COLLECTIONS.PRODUCTS, index: { storeId: 1, sku: 1, isDeleted: 1 }, options: { unique: true, sparse: true } },
  { collection: COLLECTIONS.PRODUCTS, index: { storeId: 1, slug: 1, isDeleted: 1 } },
  { collection: COLLECTIONS.PRODUCTS, index: { storeId: 1, categoryId: 1, isDeleted: 1 } },
  { collection: COLLECTIONS.PRODUCTS, index: { storeId: 1, status: 1, isDeleted: 1 } },

  // ── categories ──
  { collection: COLLECTIONS.CATEGORIES, index: { storeId: 1, isDeleted: 1, sortOrder: 1 } },
  { collection: COLLECTIONS.CATEGORIES, index: { storeId: 1, slug: 1, isDeleted: 1 } },

  // ── inventory ──
  { collection: COLLECTIONS.INVENTORY, index: { storeId: 1, deletedAt: 1, createdAt: -1 } },
  { collection: COLLECTIONS.INVENTORY, index: { storeId: 1, productId: 1, deletedAt: 1 } },
  { collection: COLLECTIONS.INVENTORY, index: { storeId: 1, deletedAt: 1, currentStock: 1 } },

  // ── inventory_movements ──
  { collection: COLLECTIONS.INVENTORY_MOVEMENTS, index: { storeId: 1, createdAt: -1 } },
  { collection: COLLECTIONS.INVENTORY_MOVEMENTS, index: { storeId: 1, inventoryId: 1 } },

  // ── bundles ──
  { collection: COLLECTIONS.BUNDLES, index: { storeId: 1, isDeleted: 1, createdAt: -1 } },

  // ── sales ──
  { collection: COLLECTIONS.SALES, index: { storeId: 1, isDeleted: 1, createdAt: -1 } },
  { collection: COLLECTIONS.SALES, index: { storeId: 1, invoiceNumber: 1, isDeleted: 1 } },
  { collection: COLLECTIONS.SALES, index: { storeId: 1, status: 1, isDeleted: 1 } },
  { collection: COLLECTIONS.SALES, index: { storeId: 1, paymentStatus: 1, isDeleted: 1 } },
  { collection: COLLECTIONS.SALES, index: { storeId: 1, paymentMethod: 1, isDeleted: 1 } },
  { collection: COLLECTIONS.SALES, index: { storeId: 1, createdBy: 1, isDeleted: 1 } },

  // ── returns ──
  { collection: COLLECTIONS.RETURNS, index: { storeId: 1, isDeleted: 1, createdAt: -1 } },
  { collection: COLLECTIONS.RETURNS, index: { storeId: 1, saleId: 1, isDeleted: 1 } },
  { collection: COLLECTIONS.RETURNS, index: { storeId: 1, invoiceNumber: 1, isDeleted: 1 } },

  // ── staff ──
  { collection: COLLECTIONS.STAFF, index: { storeId: 1, isDeleted: 1, createdAt: -1 } },
  { collection: COLLECTIONS.STAFF, index: { storeId: 1, userId: 1, isDeleted: 1 } },
  { collection: COLLECTIONS.STAFF, index: { email: 1, storeId: 1, isDeleted: 1 } },
  { collection: COLLECTIONS.STAFF, index: { invitationToken: 1, status: 1 } },

  // ── subscriptions ──
  { collection: COLLECTIONS.SUBSCRIPTIONS, index: { storeId: 1 }, options: { unique: true } },

  // ── activity_logs ──
  { collection: COLLECTIONS.ACTIVITY_LOGS, index: { storeId: 1, createdAt: -1 } },
  { collection: COLLECTIONS.ACTIVITY_LOGS, index: { createdAt: -1 } },

  // ── ai_conversations ──
  { collection: COLLECTIONS.AI_CONVERSATIONS, index: { storeId: 1, userId: 1, isDeleted: 1, updatedAt: -1 } },

  // ── customers ──
  { collection: COLLECTIONS.CUSTOMERS, index: { storeId: 1, phone: 1 } },
  { collection: COLLECTIONS.CUSTOMERS, index: { storeId: 1, email: 1 } },
];

export async function ensureIndexes(db: Db): Promise<void> {
  try {
    logger.info("Ensuring database indexes...");

    const seen = new Set<string>();

    for (const def of INDEXES) {
      const key = `${def.collection}:${JSON.stringify(def.index)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      try {
        await db.collection(def.collection).createIndex(def.index, {
          background: true,
          ...def.options,
        });
      } catch {
        // Index may already exist with different options — skip silently
      }
    }

    logger.info(`Database indexes ensured (${INDEXES.length} indexes across ${new Set(INDEXES.map((d) => d.collection)).size} collections).`);
  } catch (error) {
    logger.error("Failed to ensure indexes", error);
  }
}
