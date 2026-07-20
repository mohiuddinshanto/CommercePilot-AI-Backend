import { Db, ObjectId, Filter } from "mongodb";
import { getDatabase } from "../../config/database.js";
import { COLLECTIONS, DEAD_STOCK_DAYS } from "../../constants/index.js";
import { SaleDocument } from "../sales/sales.types.js";
import { ReturnDocument } from "../returns/returns.types.js";
import { ProductDocument } from "../products/product.types.js";
import { InventoryDocument } from "../inventory/inventory.types.js";
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
  DailyProfitBreakdown,
} from "./reports.types.js";

export class ReportsRepository {
  constructor(private db: Db) {}

  private getDateRange(params: ReportQueryParams): { startDate: string; endDate: string } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (params.startDate && params.endDate) {
      return { startDate: params.startDate, endDate: params.endDate };
    }

    switch (params.period) {
      case "today":
        return { startDate: today.toISOString(), endDate: endDate.toISOString() };
      case "yesterday": {
        const yesterdayStart = new Date(today);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        const yesterdayEnd = new Date(today);
        yesterdayEnd.setMilliseconds(-1);
        return { startDate: yesterdayStart.toISOString(), endDate: yesterdayEnd.toISOString() };
      }
      case "thisWeek": {
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        return { startDate: weekStart.toISOString(), endDate: endDate.toISOString() };
      }
      case "lastWeek": {
        const lastWeekEnd = new Date(today);
        lastWeekEnd.setMilliseconds(-1);
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekStart.getDate() - 6);
        return { startDate: lastWeekStart.toISOString(), endDate: lastWeekEnd.toISOString() };
      }
      case "thisMonth": {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return { startDate: monthStart.toISOString(), endDate: endDate.toISOString() };
      }
      case "lastMonth": {
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return { startDate: lastMonthStart.toISOString(), endDate: lastMonthEnd.toISOString() };
      }
      case "thisYear": {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return { startDate: yearStart.toISOString(), endDate: endDate.toISOString() };
      }
      case "lastYear": {
        const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
        const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        return { startDate: lastYearStart.toISOString(), endDate: lastYearEnd.toISOString() };
      }
      default: {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return { startDate: monthStart.toISOString(), endDate: endDate.toISOString() };
      }
    }
  }

  async getDashboardSummary(storeId: string): Promise<DashboardSummaryData> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const salesCollection = this.db.collection<SaleDocument>(COLLECTIONS.SALES);
    const productCollection = this.db.collection<ProductDocument>(COLLECTIONS.PRODUCTS);
    const inventoryCollection = this.db.collection<InventoryDocument>(COLLECTIONS.INVENTORY);
    const staffCollection = this.db.collection(COLLECTIONS.STAFF);

    const baseFilter = { storeId, isDeleted: false };

    const [combinedSalesAgg, totalProducts, lowStock, deadStock, totalCustomers, totalStaff] =
      await Promise.all([
        salesCollection
          .aggregate([
            { $match: baseFilter },
            {
              $facet: {
                total: [{ $group: { _id: null, total: { $sum: "$grandTotal" } } }],
                today: [
                  { $match: { createdAt: { $gte: today.toISOString(), $lte: todayEnd.toISOString() } } },
                  { $group: { _id: null, total: { $sum: "$grandTotal" } } },
                ],
                week: [
                  { $match: { createdAt: { $gte: weekStart.toISOString(), $lte: todayEnd.toISOString() } } },
                  { $group: { _id: null, total: { $sum: "$grandTotal" } } },
                ],
                month: [
                  { $match: { createdAt: { $gte: monthStart.toISOString(), $lte: todayEnd.toISOString() } } },
                  { $group: { _id: null, total: { $sum: "$grandTotal" } } },
                ],
              },
            },
          ])
          .toArray(),
        productCollection.countDocuments({ storeId, isDeleted: false }),
        inventoryCollection.countDocuments({
          storeId: storeId as unknown as ObjectId,
          $expr: { $lte: ["$currentStock", "$lowStockLimit"] },
          deletedAt: null,
        }),
        inventoryCollection.countDocuments({
          storeId: storeId as unknown as ObjectId,
          currentStock: { $gt: 0 },
          lastSoldAt: null,
          deletedAt: null,
        }),
        salesCollection.distinct("customerPhone", { storeId, isDeleted: false, customerPhone: { $ne: "" } }).then((phones) => phones.length),
        staffCollection.countDocuments({ storeId, status: { $in: ["active", "pending"] } }),
      ]);

    const facets = combinedSalesAgg[0] || { total: [], today: [], week: [], month: [] };

    return {
      totalSales: facets.total[0]?.total ? Math.round(facets.total[0].total * 100) / 100 : 0,
      todaySales: facets.today[0]?.total ? Math.round(facets.today[0].total * 100) / 100 : 0,
      weeklySales: facets.week[0]?.total ? Math.round(facets.week[0].total * 100) / 100 : 0,
      monthlySales: facets.month[0]?.total ? Math.round(facets.month[0].total * 100) / 100 : 0,
      totalProducts,
      lowStockCount: lowStock,
      deadStockCount: deadStock,
      totalCustomers: totalCustomers,
      totalStaff,
    };
  }

  async getSalesReport(storeId: string, params: ReportQueryParams): Promise<SalesReportData> {
    const { startDate, endDate } = this.getDateRange(params);
    const salesCollection = this.db.collection<SaleDocument>(COLLECTIONS.SALES);

    const baseFilter = { storeId, isDeleted: false, createdAt: { $gte: startDate, $lte: endDate } };

    const [summaryAgg, statusAgg, dailyAgg] = await Promise.all([
      salesCollection
        .aggregate([
          { $match: baseFilter },
          {
            $group: {
              _id: null,
              totalSales: { $sum: 1 },
              totalRevenue: { $sum: "$grandTotal" },
              totalDiscount: { $sum: "$discount" },
              totalTax: { $sum: "$tax" },
              totalShipping: { $sum: "$shipping" },
              totalPaid: { $sum: "$paidAmount" },
              totalDue: { $sum: "$dueAmount" },
            },
          },
        ])
        .toArray(),
      salesCollection
        .aggregate([
          { $match: baseFilter },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ])
        .toArray(),
      salesCollection
        .aggregate([
          { $match: baseFilter },
          {
            $group: {
              _id: { $substr: ["$createdAt", 0, 10] },
              salesCount: { $sum: 1 },
              revenue: { $sum: "$grandTotal" },
              paid: { $sum: "$paidAmount" },
              due: { $sum: "$dueAmount" },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
    ]);

    const summary = summaryAgg[0] || {
      totalSales: 0, totalRevenue: 0, totalDiscount: 0,
      totalTax: 0, totalShipping: 0, totalPaid: 0, totalDue: 0,
    };

    const statusMap = new Map((statusAgg as unknown as { _id: string; count: number }[]).map((s) => [s._id, s.count]));

    const dailyBreakdown: DailySalesBreakdown[] = (dailyAgg as unknown as { _id: string; salesCount: number; revenue: number; paid: number; due: number }[]).map(
      (d) => ({
        date: d._id,
        salesCount: d.salesCount,
        revenue: Math.round(d.revenue * 100) / 100,
        paid: Math.round(d.paid * 100) / 100,
        due: Math.round(d.due * 100) / 100,
      })
    );

    return {
      totalSales: summary.totalSales,
      totalRevenue: Math.round(summary.totalRevenue * 100) / 100,
      totalDiscount: Math.round(summary.totalDiscount * 100) / 100,
      totalTax: Math.round(summary.totalTax * 100) / 100,
      totalShipping: Math.round(summary.totalShipping * 100) / 100,
      totalPaid: Math.round(summary.totalPaid * 100) / 100,
      totalDue: Math.round(summary.totalDue * 100) / 100,
      avgSaleValue: summary.totalSales > 0 ? Math.round((summary.totalRevenue / summary.totalSales) * 100) / 100 : 0,
      completedSales: statusMap.get("completed") || 0,
      cancelledSales: statusMap.get("cancelled") || 0,
      refundedSales: statusMap.get("refunded") || 0,
      dailyBreakdown,
    };
  }

  async getTopProducts(storeId: string, params: ReportQueryParams, limit = 10): Promise<TopProductData[]> {
    const { startDate, endDate } = this.getDateRange(params);
    const salesCollection = this.db.collection<SaleDocument>(COLLECTIONS.SALES);

    const result = await salesCollection
      .aggregate([
        {
          $match: {
            storeId,
            isDeleted: false,
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        { $unwind: "$items" },
        { $match: { "items.productId": { $exists: true, $ne: null } } },
        {
          $group: {
            _id: "$items.productId",
            name: { $first: "$items.name" },
            sku: { $first: "$items.sku" },
            totalQuantitySold: { $sum: "$items.quantity" },
            totalRevenue: { $sum: "$items.totalPrice" },
            avgUnitPrice: { $avg: "$items.unitPrice" },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: limit },
      ])
      .toArray();

    return (result as unknown as { _id: ObjectId; name: string; sku: string; totalQuantitySold: number; totalRevenue: number; avgUnitPrice: number }[]).map(
      (r) => ({
        productId: r._id.toString(),
        name: r.name,
        sku: r.sku,
        totalQuantitySold: r.totalQuantitySold,
        totalRevenue: Math.round(r.totalRevenue * 100) / 100,
        avgUnitPrice: Math.round(r.avgUnitPrice * 100) / 100,
      })
    );
  }

  async getTopCategories(storeId: string, params: ReportQueryParams, limit = 10): Promise<TopCategoryData[]> {
    const { startDate, endDate } = this.getDateRange(params);
    const salesCollection = this.db.collection<SaleDocument>(COLLECTIONS.SALES);

    const result = await salesCollection
      .aggregate([
        {
          $match: {
            storeId,
            isDeleted: false,
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        { $unwind: "$items" },
        { $match: { "items.productId": { $exists: true, $ne: null } } },
        {
          $group: {
            _id: "$items.productId",
            totalQuantitySold: { $sum: "$items.quantity" },
            totalRevenue: { $sum: "$items.totalPrice" },
          },
        },
        {
          $lookup: {
            from: COLLECTIONS.PRODUCTS,
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        {
          $match: {
            "product.storeId": storeId,
            "product.isDeleted": false,
          },
        },
        {
          $group: {
            _id: { $ifNull: ["$product.categoryId", "uncategorized"] },
            totalQuantitySold: { $sum: "$totalQuantitySold" },
            totalRevenue: { $sum: "$totalRevenue" },
            productIds: { $addToSet: "$_id" },
          },
        },
        {
          $project: {
            _id: 0,
            categoryId: "$_id",
            categoryName: { $cond: [{ $eq: ["$_id", "uncategorized"] }, "Uncategorized", "$_id"] },
            totalQuantitySold: 1,
            totalRevenue: 1,
            productCount: { $size: "$productIds" },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: limit },
      ])
      .toArray();

    return (result as unknown as { categoryId: string; categoryName: string; totalQuantitySold: number; totalRevenue: number; productCount: number }[]).map(
      (r) => ({
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        totalQuantitySold: r.totalQuantitySold,
        totalRevenue: Math.round(r.totalRevenue * 100) / 100,
        productCount: r.productCount,
      })
    );
  }

  async getTopCustomers(storeId: string, params: ReportQueryParams, limit = 10): Promise<TopCustomerData[]> {
    const { startDate, endDate } = this.getDateRange(params);
    const salesCollection = this.db.collection<SaleDocument>(COLLECTIONS.SALES);

    const result = await salesCollection
      .aggregate([
        {
          $match: {
            storeId,
            isDeleted: false,
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { customerId: "$customerId", customerName: "$customerName", customerPhone: "$customerPhone" },
            totalOrders: { $sum: 1 },
            totalSpent: { $sum: "$grandTotal" },
          },
        },
        {
          $project: {
            _id: 0,
            customerId: "$_id.customerId",
            customerName: "$_id.customerName",
            customerPhone: "$_id.customerPhone",
            totalOrders: 1,
            totalSpent: 1,
            avgOrderValue: { $divide: ["$totalSpent", "$totalOrders"] },
          },
        },
        { $sort: { totalSpent: -1 } },
        { $limit: limit },
      ])
      .toArray();

    return (result as unknown as { customerId: ObjectId | null; customerName: string; customerPhone: string; totalOrders: number; totalSpent: number; avgOrderValue: number }[]).map(
      (r) => ({
        customerId: r.customerId ? r.customerId.toString() : null,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        totalOrders: r.totalOrders,
        totalSpent: Math.round(r.totalSpent * 100) / 100,
        avgOrderValue: Math.round(r.avgOrderValue * 100) / 100,
      })
    );
  }

  async getBestCashiers(storeId: string, params: ReportQueryParams, limit = 10): Promise<BestCashierData[]> {
    const { startDate, endDate } = this.getDateRange(params);
    const salesCollection = this.db.collection<SaleDocument>(COLLECTIONS.SALES);

    const result = await salesCollection
      .aggregate([
        {
          $match: {
            storeId,
            isDeleted: false,
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: "$createdBy",
            totalSales: { $sum: 1 },
            totalRevenue: { $sum: "$grandTotal" },
          },
        },
        {
          $project: {
            _id: 0,
            createdBy: "$_id",
            totalSales: 1,
            totalRevenue: 1,
            avgSaleValue: { $divide: ["$totalRevenue", "$totalSales"] },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: limit },
      ])
      .toArray();

    return (result as unknown as { createdBy: string; totalSales: number; totalRevenue: number; avgSaleValue: number }[]).map(
      (r) => ({
        createdBy: r.createdBy,
        totalSales: r.totalSales,
        totalRevenue: Math.round(r.totalRevenue * 100) / 100,
        avgSaleValue: Math.round(r.avgSaleValue * 100) / 100,
      })
    );
  }

  async getSalesByPaymentMethod(storeId: string, params: ReportQueryParams): Promise<SalesByPaymentMethodData[]> {
    const { startDate, endDate } = this.getDateRange(params);
    const salesCollection = this.db.collection<SaleDocument>(COLLECTIONS.SALES);

    const result = await salesCollection
      .aggregate([
        {
          $match: {
            storeId,
            isDeleted: false,
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: "$paymentMethod",
            count: { $sum: 1 },
            totalRevenue: { $sum: "$grandTotal" },
            totalPaid: { $sum: "$paidAmount" },
          },
        },
        { $sort: { totalRevenue: -1 } },
      ])
      .toArray();

    return (result as unknown as { _id: string; count: number; totalRevenue: number; totalPaid: number }[]).map(
      (r) => ({
        method: r._id,
        count: r.count,
        totalRevenue: Math.round(r.totalRevenue * 100) / 100,
        totalPaid: Math.round(r.totalPaid * 100) / 100,
      })
    );
  }

  async getSalesByDay(storeId: string, params: ReportQueryParams): Promise<DailySalesBreakdown[]> {
    const { startDate, endDate } = this.getDateRange(params);
    const salesCollection = this.db.collection<SaleDocument>(COLLECTIONS.SALES);

    const result = await salesCollection
      .aggregate([
        {
          $match: {
            storeId,
            isDeleted: false,
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { $substr: ["$createdAt", 0, 10] },
            salesCount: { $sum: 1 },
            revenue: { $sum: "$grandTotal" },
            paid: { $sum: "$paidAmount" },
            due: { $sum: "$dueAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    return (result as unknown as { _id: string; salesCount: number; revenue: number; paid: number; due: number }[]).map(
      (d) => ({
        date: d._id,
        salesCount: d.salesCount,
        revenue: Math.round(d.revenue * 100) / 100,
        paid: Math.round(d.paid * 100) / 100,
        due: Math.round(d.due * 100) / 100,
      })
    );
  }

  async getSalesByMonth(storeId: string, params: ReportQueryParams): Promise<DailySalesBreakdown[]> {
    const { startDate, endDate } = this.getDateRange(params);
    const salesCollection = this.db.collection<SaleDocument>(COLLECTIONS.SALES);

    const result = await salesCollection
      .aggregate([
        {
          $match: {
            storeId,
            isDeleted: false,
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { $substr: ["$createdAt", 0, 7] },
            salesCount: { $sum: 1 },
            revenue: { $sum: "$grandTotal" },
            paid: { $sum: "$paidAmount" },
            due: { $sum: "$dueAmount" },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    return (result as unknown as { _id: string; salesCount: number; revenue: number; paid: number; due: number }[]).map(
      (d) => ({
        date: d._id,
        salesCount: d.salesCount,
        revenue: Math.round(d.revenue * 100) / 100,
        paid: Math.round(d.paid * 100) / 100,
        due: Math.round(d.due * 100) / 100,
      })
    );
  }

  async getInventoryValue(storeId: string): Promise<InventoryValueData> {
    const productCollection = this.db.collection<ProductDocument>(COLLECTIONS.PRODUCTS);
    const inventoryCollection = this.db.collection<InventoryDocument>(COLLECTIONS.INVENTORY);

    const [productCount, inventoryAgg, lowStock, outOfStock] = await Promise.all([
      productCollection.countDocuments({ storeId, isDeleted: false }),
      inventoryCollection
        .aggregate([
          { $match: { storeId: new ObjectId(storeId), deletedAt: null } },
          {
            $group: {
              _id: null,
              totalStockUnits: { $sum: "$currentStock" },
              totalInventoryValue: { $sum: { $multiply: ["$currentStock", "$costPrice"] } },
            },
          },
        ])
        .toArray(),
      inventoryCollection.countDocuments({
        storeId: new ObjectId(storeId),
        $expr: { $and: [{ $gt: ["$currentStock", 0] }, { $lte: ["$currentStock", "$lowStockLimit"] }] },
        deletedAt: null,
      } as Filter<InventoryDocument>),
      inventoryCollection.countDocuments({
        storeId: new ObjectId(storeId),
        currentStock: 0,
        deletedAt: null,
      } as Filter<InventoryDocument>),
    ]);

    const inv = inventoryAgg[0] || { totalStockUnits: 0, totalInventoryValue: 0 };

    return {
      totalProducts: productCount,
      totalStockUnits: inv.totalStockUnits,
      totalInventoryValue: Math.round(inv.totalInventoryValue * 100) / 100,
      lowStockCount: lowStock,
      outOfStockCount: outOfStock,
    };
  }

  async getLowStockProducts(storeId: string, limit = 20): Promise<LowStockData[]> {
    const productCollection = this.db.collection<ProductDocument>(COLLECTIONS.PRODUCTS);

    const result = await productCollection
      .aggregate([
        {
          $match: {
            storeId,
            isDeleted: false,
            status: { $ne: "archived" },
            stock: { $gt: 0 },
          },
        },
        {
          $match: {
            $expr: { $lte: ["$stock", "$lowStockLimit"] },
          },
        },
        { $sort: { stock: 1 } },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            productId: { $toString: "$_id" },
            name: 1,
            sku: 1,
            currentStock: "$stock",
            lowStockLimit: 1,
            status: 1,
          },
        },
      ])
      .toArray();

    return (result as unknown as { productId: string; name: string; sku: string; currentStock: number; lowStockLimit: number; status: string }[]).map(
      (p) => ({
        productId: p.productId,
        name: p.name,
        sku: p.sku,
        currentStock: p.currentStock,
        lowStockLimit: p.lowStockLimit,
        status: p.status,
      })
    );
  }

  async getDeadStockProducts(storeId: string, limit = 20): Promise<DeadStockData[]> {
    const productCollection = this.db.collection<ProductDocument>(COLLECTIONS.PRODUCTS);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DEAD_STOCK_DAYS);
    const cutoffISO = cutoffDate.toISOString();

    const result = await productCollection
      .aggregate([
        {
          $match: {
            storeId,
            isDeleted: false,
            stock: { $gt: 0 },
          },
        },
        {
          $lookup: {
            from: COLLECTIONS.INVENTORY,
            let: { productId: "$_id", storeOid: { $toObjectId: storeId } },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$productId", "$$productId"] },
                      { $eq: ["$storeId", "$$storeOid"] },
                      { $eq: ["$deletedAt", null] },
                    ],
                  },
                },
              },
            ],
            as: "inventory",
          },
        },
        { $unwind: { path: "$inventory", preserveNullAndEmptyArrays: true } },
        {
          $match: {
            $or: [
              { "inventory.lastSoldAt": null },
              { "inventory.lastSoldAt": { $lt: cutoffISO } },
            ],
          },
        },
        {
          $project: {
            _id: 0,
            productId: { $toString: "$_id" },
            name: 1,
            sku: 1,
            currentStock: "$stock",
            lastSoldAt: "$inventory.lastSoldAt",
            inventoryValue: { $round: [{ $multiply: ["$stock", "$costPrice", 100] }, 0] },
          },
        },
        {
          $addFields: {
            inventoryValue: { $divide: ["$inventoryValue", 100] },
            daysSinceLastSale: {
              $cond: {
                if: { $ne: ["$lastSoldAt", null] },
                then: {
                  $floor: {
                    $divide: [
                      { $subtract: [new Date().getTime(), { $toLong: { $toDate: "$lastSoldAt" } }] },
                      { $multiply: [1000, 60, 60, 24] },
                    ],
                  },
                },
                else: null,
              },
            },
            lastSoldAt: {
              $cond: {
                if: { $eq: ["$lastSoldAt", null] },
                then: null,
                else: "$lastSoldAt",
              },
            },
          },
        },
        { $sort: { inventoryValue: -1 } },
        { $limit: limit },
      ])
      .toArray();

    return (result as unknown as { productId: string; name: string; sku: string; currentStock: number; lastSoldAt: string | null; daysSinceLastSale: number | null; inventoryValue: number }[]).map(
      (r) => ({
        productId: r.productId,
        name: r.name,
        sku: r.sku,
        currentStock: r.currentStock,
        lastSoldAt: r.lastSoldAt,
        daysSinceLastSale: r.daysSinceLastSale,
        inventoryValue: Math.round(r.inventoryValue * 100) / 100,
      })
    );
  }

  async getProfitReport(storeId: string, params: ReportQueryParams): Promise<ProfitReportData> {
    const { startDate, endDate } = this.getDateRange(params);
    const salesCollection = this.db.collection<SaleDocument>(COLLECTIONS.SALES);

    const result = await salesCollection
      .aggregate([
        {
          $match: {
            storeId,
            isDeleted: false,
            status: "completed",
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        { $unwind: "$items" },
        {
          $lookup: {
            from: COLLECTIONS.PRODUCTS,
            let: { productId: "$items.productId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$_id", "$$productId"] },
                    ],
                  },
                },
              },
              { $project: { costPrice: 1, storeId: 1, isDeleted: 1 } },
            ],
            as: "productInfo",
          },
        },
        { $unwind: { path: "$productInfo", preserveNullAndEmptyArrays: true } },
        {
          $match: {
            $or: [
              { "productInfo.storeId": storeId },
              { productInfo: { $exists: false } },
            ],
          },
        },
        {
          $group: {
            _id: { $substr: ["$createdAt", 0, 10] },
            revenue: { $sum: "$grandTotal" },
            cost: {
              $sum: {
                $cond: {
                  if: { $and: [{ $ne: ["$productInfo", null] }, { $eq: ["$productInfo.storeId", storeId] }, { $eq: ["$productInfo.isDeleted", false] }] },
                  then: { $multiply: [{ $ifNull: ["$productInfo.costPrice", 0] }, "$items.quantity"] },
                  else: 0,
                },
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    let totalRevenue = 0;
    let totalCost = 0;
    const dailyBreakdown: DailyProfitBreakdown[] = [];

    for (const doc of result) {
      const typed = doc as unknown as { _id: string; revenue: number; cost: number };
      totalRevenue += typed.revenue;
      totalCost += typed.cost;
      dailyBreakdown.push({
        date: typed._id,
        revenue: Math.round(typed.revenue * 100) / 100,
        cost: Math.round(typed.cost * 100) / 100,
        profit: Math.round((typed.revenue - typed.cost) * 100) / 100,
      });
    }

    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      profitMargin,
      dailyBreakdown,
    };
  }

  async getMostReturnedProducts(storeId: string, params: ReportQueryParams, limit = 10): Promise<MostReturnedProductData[]> {
    const { startDate, endDate } = this.getDateRange(params);
    const returnsCollection = this.db.collection<ReturnDocument>(COLLECTIONS.RETURNS);

    const result = await returnsCollection
      .aggregate([
        {
          $match: {
            storeId,
            isDeleted: false,
            status: "completed",
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        { $unwind: "$items" },
        { $match: { "items.productId": { $exists: true, $ne: null } } },
        {
          $group: {
            _id: "$items.productId",
            totalReturned: { $sum: "$items.quantity" },
            totalRefundAmount: { $sum: "$items.refundAmount" },
          },
        },
        { $sort: { totalReturned: -1 } },
        { $limit: limit },
      ])
      .toArray();

    if (result.length === 0) return [];

    const typedResults = result as unknown as { _id: ObjectId; totalReturned: number; totalRefundAmount: number }[];
    const productCollection = this.db.collection<ProductDocument>(COLLECTIONS.PRODUCTS);
    const productIds = typedResults.map((r) => r._id);
    const products = await productCollection
      .find({ _id: { $in: productIds }, storeId })
      .toArray();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    return typedResults.map(
      (r) => {
        const product = productMap.get(r._id.toString());
        return {
          productId: r._id.toString(),
          name: product?.name || "Unknown",
          sku: product?.sku || "N/A",
          totalReturned: r.totalReturned,
          totalRefundAmount: Math.round(r.totalRefundAmount * 100) / 100,
        };
      }
    );
  }
}

let instance: ReportsRepository | null = null;

export function getReportsRepository(): ReportsRepository {
  if (!instance) {
    instance = new ReportsRepository(getDatabase());
  }
  return instance;
}
