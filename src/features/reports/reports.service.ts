import { getReportsRepository } from "./reports.repository.js";
import {
  ReportQueryParams,
  DashboardSummaryData,
  SalesReportData,
  TopProductData,
  TopCategoryData,
  TopCustomerData,
  BestCashierData,
  SalesByPaymentMethodData,
  InventoryValueData,
  LowStockData,
  DeadStockData,
  ProfitReportData,
  MostReturnedProductData,
  DailySalesBreakdown,
} from "./reports.types.js";

export class ReportsService {
  private repo = getReportsRepository();

  async getDashboardSummary(storeId: string): Promise<DashboardSummaryData> {
    return this.repo.getDashboardSummary(storeId);
  }

  async getSalesReport(storeId: string, params: ReportQueryParams): Promise<SalesReportData> {
    return this.repo.getSalesReport(storeId, params);
  }

  async getTopProducts(storeId: string, params: ReportQueryParams, limit?: number): Promise<TopProductData[]> {
    return this.repo.getTopProducts(storeId, params, limit);
  }

  async getTopCategories(storeId: string, params: ReportQueryParams, limit?: number): Promise<TopCategoryData[]> {
    return this.repo.getTopCategories(storeId, params, limit);
  }

  async getTopCustomers(storeId: string, params: ReportQueryParams, limit?: number): Promise<TopCustomerData[]> {
    return this.repo.getTopCustomers(storeId, params, limit);
  }

  async getBestCashiers(storeId: string, params: ReportQueryParams, limit?: number): Promise<BestCashierData[]> {
    return this.repo.getBestCashiers(storeId, params, limit);
  }

  async getSalesByPaymentMethod(storeId: string, params: ReportQueryParams): Promise<SalesByPaymentMethodData[]> {
    return this.repo.getSalesByPaymentMethod(storeId, params);
  }

  async getSalesByDay(storeId: string, params: ReportQueryParams): Promise<DailySalesBreakdown[]> {
    return this.repo.getSalesByDay(storeId, params);
  }

  async getSalesByMonth(storeId: string, params: ReportQueryParams): Promise<DailySalesBreakdown[]> {
    return this.repo.getSalesByMonth(storeId, params);
  }

  async getInventoryValue(storeId: string): Promise<InventoryValueData> {
    return this.repo.getInventoryValue(storeId);
  }

  async getLowStockProducts(storeId: string, limit?: number): Promise<LowStockData[]> {
    return this.repo.getLowStockProducts(storeId, limit);
  }

  async getDeadStockProducts(storeId: string, limit?: number): Promise<DeadStockData[]> {
    return this.repo.getDeadStockProducts(storeId, limit);
  }

  async getProfitReport(storeId: string, params: ReportQueryParams): Promise<ProfitReportData> {
    return this.repo.getProfitReport(storeId, params);
  }

  async getMostReturnedProducts(storeId: string, params: ReportQueryParams, limit?: number): Promise<MostReturnedProductData[]> {
    return this.repo.getMostReturnedProducts(storeId, params, limit);
  }
}

let instance: ReportsService | null = null;

export function getReportsService(): ReportsService {
  if (!instance) {
    instance = new ReportsService();
  }
  return instance;
}
