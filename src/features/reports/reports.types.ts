export interface ReportQueryParams {
  startDate?: string;
  endDate?: string;
  period?: "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "thisYear" | "lastYear" | "custom";
  categoryId?: string;
  productId?: string;
  paymentMethod?: string;
}

export interface DashboardSummaryData {
  totalSales: number;
  todaySales: number;
  weeklySales: number;
  monthlySales: number;
  totalProducts: number;
  lowStockCount: number;
  deadStockCount: number;
  totalCustomers: number;
  totalStaff: number;
}

export interface SalesReportData {
  totalSales: number;
  totalRevenue: number;
  totalDiscount: number;
  totalTax: number;
  totalShipping: number;
  totalPaid: number;
  totalDue: number;
  avgSaleValue: number;
  completedSales: number;
  cancelledSales: number;
  refundedSales: number;
  dailyBreakdown: DailySalesBreakdown[];
}

export interface DailySalesBreakdown {
  date: string;
  salesCount: number;
  revenue: number;
  paid: number;
  due: number;
}

export interface TopProductData {
  productId: string;
  name: string;
  sku: string;
  totalQuantitySold: number;
  totalRevenue: number;
  avgUnitPrice: number;
}

export interface TopCategoryData {
  categoryId: string;
  categoryName: string;
  totalQuantitySold: number;
  totalRevenue: number;
  productCount: number;
}

export interface TopCustomerData {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  totalOrders: number;
  totalSpent: number;
  avgOrderValue: number;
}

export interface BestCashierData {
  createdBy: string;
  totalSales: number;
  totalRevenue: number;
  avgSaleValue: number;
}

export interface SalesByPaymentMethodData {
  method: string;
  count: number;
  totalRevenue: number;
  totalPaid: number;
}

export interface InventoryValueData {
  totalProducts: number;
  totalStockUnits: number;
  totalInventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface LowStockData {
  productId: string;
  name: string;
  sku: string;
  currentStock: number;
  lowStockLimit: number;
  status: string;
}

export interface DeadStockData {
  productId: string;
  name: string;
  sku: string;
  currentStock: number;
  lastSoldAt: string | null;
  daysSinceLastSale: number | null;
  inventoryValue: number;
}

export interface ProfitReportData {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  dailyBreakdown: DailyProfitBreakdown[];
}

export interface DailyProfitBreakdown {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
}

export interface MostReturnedProductData {
  productId: string;
  name: string;
  sku: string;
  totalReturned: number;
  totalRefundAmount: number;
}
