import { ObjectId } from "mongodb";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIConversationDocument {
  _id: ObjectId;
  storeId: string;
  userId: string;
  title: string;
  messages: AIMessage[];
  model: string;
  totalTokens: number;
  messageCount: number;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatInput {
  message: string;
  conversationId?: string;
  model?: string;
}

export interface ChatResponse {
  conversationId: string;
  userMessage: AIMessage;
  assistantMessage: AIMessage;
  model: string;
  tokensUsed: number;
  title: string;
}

export interface ConversationListItem {
  id: string;
  title: string;
  model: string;
  messageCount: number;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  model: string;
  messages: AIMessage[];
  totalTokens: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoreContextData {
  store: { storeName: string; plan: string; currency: string } | null;
  productStats: {
    totalProducts: number;
    activeProducts: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    topProducts: { name: string; sku: string; stock: number; sellingPrice: number }[];
  };
  categoryStats: {
    totalCategories: number;
    topCategories: { name: string; productCount: number }[];
  };
  inventoryStats: {
    totalStock: number;
    totalValue: number;
    lowStock: number;
    outOfStock: number;
  };
  salesStats: {
    todaySales: { revenue: number }[];
    weekSales: { revenue: number }[];
    monthSales: { revenue: number }[];
    totalSalesAgg: { total: number }[];
    todayCount: number;
    monthCount: number;
    paymentMethodAgg: { _id: string }[];
  };
  staffStats: {
    totalStaff: number;
    activeStaff: number;
  };
}

export interface StoreAIContext {
  store: {
    name: string;
    plan: string;
    currency: string;
  };
  products: {
    total: number;
    active: number;
    lowStock: number;
    outOfStock: number;
    topProducts: { name: string; sku: string; stock: number; sellingPrice: number }[];
  };
  categories: {
    total: number;
    topCategories: { name: string; productCount: number }[];
  };
  inventory: {
    totalStock: number;
    totalValue: number;
    lowStockItems: number;
    outOfStockItems: number;
  };
  sales: {
    todayRevenue: number;
    weekRevenue: number;
    monthRevenue: number;
    totalRevenue: number;
    todayCount: number;
    monthCount: number;
    avgOrderValue: number;
    topPaymentMethod: string;
  };
  staff: {
    total: number;
    active: number;
  };
}

export interface GenerateContentInput {
  contentType: "product_description" | "social_post" | "blog_outline" | "email_newsletter";
  titleOrKeywords: string;
  keyFeatures?: string;
  tone: "professional" | "friendly" | "casual" | "excited" | "persuasive";
  length: "short" | "medium" | "long";
}

export interface GenerateContentResponse {
  content: string;
  tokensUsed: number;
  model: string;
}

