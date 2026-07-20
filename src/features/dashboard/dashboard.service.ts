import { getDashboardRepository } from "./dashboard.repository.js";
import { getReportsService } from "../reports/reports.service.js";
import { DashboardSummaryData } from "../reports/reports.types.js";
import { ActivityLogDocument } from "../auth/auth.types.js";

export class DashboardService {
  private repo = getDashboardRepository();
  private reportsService = getReportsService();

  async getDashboardSummary(storeId: string): Promise<DashboardSummaryData> {
    return this.reportsService.getDashboardSummary(storeId);
  }

  async getRecentActivities(
    storeId: string,
    limit: number = 10,
    page: number = 1
  ): Promise<{ items: ActivityLogDocument[]; total: number }> {
    return this.repo.getRecentActivities(storeId, limit, page);
  }
}

let serviceInstance: DashboardService | null = null;

export function getDashboardService(): DashboardService {
  if (!serviceInstance) {
    serviceInstance = new DashboardService();
  }
  return serviceInstance;
}
