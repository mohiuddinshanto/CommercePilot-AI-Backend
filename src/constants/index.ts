export const ROLES = {
  SUPER_ADMIN: "super_admin",
  OWNER: "owner",
  STAFF: "staff",
} as const;

export const STAFF_ROLES = {
  MANAGER: "manager",
  CASHIER: "cashier",
  INVENTORY_MANAGER: "inventory_manager",
  SALES_MANAGER: "sales_manager",
} as const;

export const ACCOUNT_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  SUSPENDED: "suspended",
} as const;

export const PLANS = {
  STARTER: "starter",
  PRO: "pro",
  BUSINESS: "business",
} as const;

export const PLAN_LIMITS = {
  starter: {
    maxProducts: 100,
    maxCategories: 10,
    maxInventory: 500,
    maxStaff: 5,
    maxAiRequests: 50,
    features: ["inventory", "sales", "returns", "basic_reports", "basic_analytics"],
  },
  pro: {
    maxProducts: 5000,
    maxCategories: -1,
    maxInventory: -1,
    maxStaff: 25,
    maxAiRequests: 500,
    features: [
      "inventory", "sales", "returns", "reports", "analytics",
      "ai_reports", "marketing_generator", "seo_generator",
      "excel_export", "pdf_export",
    ],
  },
  business: {
    maxProducts: -1,
    maxCategories: -1,
    maxInventory: -1,
    maxStaff: -1,
    maxAiRequests: -1,
    features: [
      "inventory", "sales", "returns", "reports", "analytics",
      "ai_reports", "marketing_generator", "seo_generator",
      "excel_export", "pdf_export", "warehouse", "ai_forecasting", "api_access",
    ],
  },
} as const;

export const PRODUCT_STATUS = {
  ACTIVE: "active",
  DRAFT: "draft",
  ARCHIVED: "archived",
  OUT_OF_STOCK: "out_of_stock",
} as const;

export const BUNDLE_STATUS = {
  ACTIVE: "active",
  DRAFT: "draft",
  ARCHIVED: "archived",
} as const;

export const INVENTORY_TYPE = {
  STOCK_IN: "stock_in",
  STOCK_OUT: "stock_out",
  ADJUSTMENT: "adjustment",
  SALE: "sale",
  RETURN: "return",
} as const;

export const PAYMENT_METHOD = {
  CASH: "cash",
  CARD: "card",
  MOBILE_BANKING: "mobile_banking",
  BANK_TRANSFER: "bank_transfer",
} as const;

export const PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  PARTIAL: "partial",
  DUE: "due",
  FAILED: "failed",
  REFUNDED: "refunded",
} as const;

export const SALE_STATUS = {
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
} as const;

export const RETURN_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  COMPLETED: "completed",
} as const;

export const REPORT_TYPE = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  INVENTORY: "inventory",
  SALES: "sales",
  PROFIT: "profit",
  ANALYTICS: "analytics",
} as const;

export const NOTIFICATION_TYPE = {
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
  INFO: "info",
  SYSTEM: "system",
} as const;

export const ACTIVITY_ACTION = {
  REGISTER: "REGISTER",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  CREATE_PRODUCT: "CREATE_PRODUCT",
  UPDATE_PRODUCT: "UPDATE_PRODUCT",
  DELETE_PRODUCT: "DELETE_PRODUCT",
  CREATE_SALE: "CREATE_SALE",
  UPDATE_SALE: "UPDATE_SALE",
  DELETE_SALE: "DELETE_SALE",
  COMPLETE_SALE: "COMPLETE_SALE",
  RETURN_PRODUCT: "RETURN_PRODUCT",
  CREATE_RETURN: "CREATE_RETURN",
  UPDATE_RETURN: "UPDATE_RETURN",
  DELETE_RETURN: "DELETE_RETURN",
  APPROVE_RETURN: "APPROVE_RETURN",
  COMPLETE_RETURN: "COMPLETE_RETURN",
  CREATE_STAFF: "CREATE_STAFF",
  DELETE_STAFF: "DELETE_STAFF",
  AI_REQUEST: "AI_REQUEST",
  PLAN_CHANGED: "PLAN_CHANGED",
  CREATE_STORE: "CREATE_STORE",
  STORE_APPROVED: "STORE_APPROVED",
  STORE_REJECTED: "STORE_REJECTED",
  CREATE_INVENTORY: "CREATE_INVENTORY",
  UPDATE_INVENTORY: "UPDATE_INVENTORY",
  DELETE_INVENTORY: "DELETE_INVENTORY",
  STOCK_IN: "STOCK_IN",
  STOCK_OUT: "STOCK_OUT",
  STOCK_ADJUSTMENT: "STOCK_ADJUSTMENT",
  CREATE_CATEGORY: "CREATE_CATEGORY",
  UPDATE_CATEGORY: "UPDATE_CATEGORY",
  DELETE_CATEGORY: "DELETE_CATEGORY",
  CREATE_BUNDLE: "CREATE_BUNDLE",
  UPDATE_BUNDLE: "UPDATE_BUNDLE",
  DELETE_BUNDLE: "DELETE_BUNDLE",
  INVITE_STAFF: "INVITE_STAFF",
  ACCEPT_INVITATION: "ACCEPT_INVITATION",
  UPDATE_STAFF: "UPDATE_STAFF",
  SUSPEND_STAFF: "SUSPEND_STAFF",
  ACTIVATE_STAFF: "ACTIVATE_STAFF",
  REMOVE_STAFF: "REMOVE_STAFF",
  SUBSCRIPTION_CREATED: "SUBSCRIPTION_CREATED",
  PLAN_UPGRADED: "PLAN_UPGRADED",
  PLAN_DOWNGRADED: "PLAN_DOWNGRADED",
  SUBSCRIPTION_CANCELLED: "SUBSCRIPTION_CANCELLED",
  SUBSCRIPTION_RENEWED: "SUBSCRIPTION_RENEWED",
  STORE_SUSPENDED: "STORE_SUSPENDED",
  STORE_ACTIVATED: "STORE_ACTIVATED",
  USER_APPROVED: "USER_APPROVED",
  USER_REJECTED: "USER_REJECTED",
  USER_SUSPENDED: "USER_SUSPENDED",
  USER_ACTIVATED: "USER_ACTIVATED",
  SUBSCRIPTION_UPDATED: "SUBSCRIPTION_UPDATED",
  SYSTEM_SETTING_UPDATED: "SYSTEM_SETTING_UPDATED",
} as const;

export const STAFF_PERMISSIONS = {
  PRODUCTS: "products",
  CATEGORIES: "categories",
  INVENTORY: "inventory",
  BUNDLES: "bundles",
  SALES: "sales",
  REPORTS: "reports",
  ANALYTICS: "analytics",
  STAFF: "staff",
  SETTINGS: "settings",
  AI: "ai",
} as const;

export const COLLECTIONS = {
  USERS: "user",
  SESSIONS: "session",
  ACCOUNTS: "account",
  VERIFICATIONS: "verification",
  STORES: "stores",
  PRODUCTS: "products",
  CATEGORIES: "categories",
  INVENTORY: "inventory",
  INVENTORY_MOVEMENTS: "inventory_movements",
  BUNDLES: "bundles",
  SALES: "sales",
  RETURNS: "returns",
  CUSTOMERS: "customers",
  STAFF: "staff",
  SUBSCRIPTIONS: "subscriptions",
  ACTIVITY_LOGS: "activity_logs",
  AI_CONVERSATIONS: "ai_conversations",
  NOTIFICATIONS: "notifications",
  REPORTS: "reports",
  SYSTEM_SETTINGS: "system_settings",
} as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const LOW_STOCK_LIMIT = 10;
export const DEAD_STOCK_DAYS = 90;
