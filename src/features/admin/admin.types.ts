export interface PlatformDashboard {
  totalStores: number;
  totalUsers: number;
  totalStaff: number;
  totalSubscriptions: number;
  totalRevenue: number;
  monthlyRevenue: number;
  totalAiConversations: number;
  totalSales: number;
  totalProducts: number;
  pendingStores: number;
  activeStores: number;
  suspendedStores: number;
  planBreakdown: {
    starter: number;
    pro: number;
    business: number;
  };
  recentActivity: ActivityLogItem[];
}

export interface AdminStore {
  _id: string;
  ownerId: string;
  storeName: string;
  storeSlug: string;
  logo?: string;
  phone?: string;
  email?: string;
  address?: string;
  currency: string;
  timezone: string;
  plan: string;
  accountStatus: string;
  isActive: boolean;
  ownerName?: string;
  ownerEmail?: string;
  productCount?: number;
  staffCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  _id: string;
  storeId?: string;
  name: string;
  email: string;
  image?: string;
  phone?: string;
  role: string;
  accountStatus: string;
  plan?: string;
  isActive: boolean;
  lastLogin?: string;
  storeName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSubscription {
  _id: string;
  storeId: string;
  storeName?: string;
  plan: string;
  status: string;
  billingCycle: string;
  price: number;
  currency: string;
  startedAt: string;
  expiresAt: string;
  renewalDate: string;
  cancelledAt?: string;
  isTrial: boolean;
  trialEndsAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLogItem {
  _id: string;
  storeId?: string;
  userId: string;
  userName?: string;
  action: string;
  module: string;
  description: string;
  ip?: string;
  device?: string;
  createdAt: string;
}

export interface SystemStats {
  totalCollections: number;
  totalDocuments: number;
  collections: Record<string, number>;
  dbSize: string;
  uptime: number;
  nodeVersion: string;
  platform: string;
}

export interface UpdateStoreStatusInput {
  status: "approved" | "rejected" | "suspended";
  reason?: string;
}

export interface UpdateUserStatusInput {
  status: "approved" | "rejected" | "suspended";
  reason?: string;
}

export interface UpdateSubscriptionInput {
  plan?: string;
  status?: string;
  billingCycle?: string;
}

export interface AdminQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  plan?: string;
  role?: string;
  storeId?: string;
  action?: string;
  module?: string;
  sortBy?: string;
  order?: "asc" | "desc";
}

export interface PlatformSettings {
  siteName: string;
  supportEmail: string;
  maintenanceMode: boolean;
  announcementBanner: string;
  featureFlags: Record<string, boolean>;
}
