import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId, Db } from "mongodb";
import http from "http";

const TEST_PORT = 5101;
let mongoServer: MongoMemoryServer;
let db: Db;
let client: MongoClient;
let server: http.Server | undefined;

interface TestResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: TestResult[] = [];

function assert(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}: ${name} - ${detail}`);
}

function request(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  cookies?: string[]
): Promise<{ status: number; body: Record<string, unknown>; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const cookieHeader = cookies?.join("; ") || "";
    const options: http.RequestOptions = {
      hostname: "localhost",
      port: TEST_PORT,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Referer: "http://localhost:3000/",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = { raw: data };
        }
        resolve({
          status: res.statusCode || 0,
          body: parsed,
          headers: res.headers,
        });
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function extractCookies(headers: http.IncomingHttpHeaders): string[] {
  const setCookies = headers["set-cookie"];
  if (!setCookies) return [];
  const arr = Array.isArray(setCookies) ? setCookies : [setCookies];
  return arr.map((c: string) => c.split(";")[0]);
}

async function runTests(): Promise<void> {
  console.log("\n========== PHASE 11 E2E VERIFICATION: REPORTS & ANALYTICS ==========\n");

  let ownerCookies: string[] = [];
  let storeId = "";

  try {
    // ─── SETUP ───
    console.log("Setting up test environment...");

    const { default: app } = await import("../src/app");

    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri);
    await client.connect();
    db = client.db("commercepilot_test");

    const { setDatabase } = await import("../src/config/database");
    setDatabase(db);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(TEST_PORT, resolve));
    console.log(`Server running on port ${TEST_PORT}\n`);

    // ─── SEED DATA ───
    console.log("Seeding test data...");

    // Register owner via auth API
    const regRes = await request("POST", "/api/auth/sign-up/email", {
      name: "Test Owner",
      email: "owner-reports@test.com",
      password: "TestPass123!",
    });
    ownerCookies = extractCookies(regRes.headers);

    // Get userId from the registered user
    const registeredUser = await db.collection("user").findOne({ email: "owner-reports@test.com" });
    const userId = registeredUser!._id;
    storeId = userId.toString();

    // Create store via API
    const storeRes = await request("POST", "/api/v1/stores", {
      name: "Test Store",
      slug: "test-store-reports",
    }, ownerCookies);
    console.log("DEBUG store creation response:", storeRes.status, JSON.stringify(storeRes.body));

    // Get storeId from response
    const storeData = (storeRes.body as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    storeId = (storeData?.storeId || storeData?._id) as string;

    // Approve the user account
    await db.collection("user").updateOne(
      { _id: new ObjectId(userId.toString()) },
      { $set: { accountStatus: "approved" } }
    );

    // Approve the store
    await db.collection("stores").updateOne(
      { _id: new ObjectId(storeId) },
      { $set: { status: "approved", accountStatus: "approved", isActive: true } }
    );

    // Re-login to get fresh session with storeId
    await request("POST", "/api/auth/sign-out", undefined, ownerCookies);
    const loginRes = await request("POST", "/api/auth/sign-in/email", {
      email: "owner-reports@test.com",
      password: "TestPass123!",
    }, undefined);
    console.log("DEBUG login status:", loginRes.status);
    if (loginRes.status === 200) {
      ownerCookies = extractCookies(loginRes.headers);
    } else {
      const session = await db.collection("session").findOne({ userId: userId.toString() });
      if (session) {
        ownerCookies = [`better-auth.session_token=${session.token}`];
      }
    }
    console.log("DEBUG cookies:", ownerCookies);

    // Debug: Check user state
    const debugUser = await db.collection("user").findOne({ _id: new ObjectId(userId.toString()) });
    console.log("DEBUG user storeId:", debugUser?.storeId, "accountStatus:", debugUser?.accountStatus);
    console.log("DEBUG user keys:", debugUser ? Object.keys(debugUser) : "null");
    const debugStore = await db.collection("stores").findOne({ _id: new ObjectId(storeId) });
    console.log("DEBUG store:", debugStore ? JSON.stringify(debugStore) : "null");
    const debugStore2 = await db.collection("stores").findOne({ ownerId: userId.toString() });
    console.log("DEBUG store by ownerId:", debugStore2 ? JSON.stringify(debugStore2) : "null");
    const debugAllStores = await db.collection("stores").find({}).toArray();
    console.log("DEBUG all stores:", debugAllStores.length, debugAllStores.map(s => ({ _id: s._id, ownerId: s.ownerId, name: s.storeName || s.name })));

    // Create staff record for activity logs
    await db.collection("staff").insertOne({
      storeId,
      userId: userId.toString(),
      name: "Test Owner",
      email: "owner-reports@test.com",
      role: "owner",
      permissions: ["products", "inventory", "sales", "reports", "analytics", "staff", "settings"],
      status: "active",
      invitedBy: userId.toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create categories
    const catId1 = new ObjectId();
    const catId2 = new ObjectId();
    await db.collection("categories").insertMany([
      { _id: catId1, storeId, name: "Electronics", slug: "electronics", description: "", isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { _id: catId2, storeId, name: "Clothing", slug: "clothing", description: "", isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);

    // Create products
    const prodId1 = new ObjectId();
    const prodId2 = new ObjectId();
    const prodId3 = new ObjectId();
    await db.collection("products").insertMany([
      { _id: prodId1, storeId, categoryId: catId1.toString(), sku: "ELEC-001", name: "Laptop", slug: "laptop", costPrice: 500, sellingPrice: 800, stock: 50, lowStockLimit: 10, status: "active", isDeleted: false, images: [], tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { _id: prodId2, storeId, categoryId: catId1.toString(), sku: "ELEC-002", name: "Phone", slug: "phone", costPrice: 200, sellingPrice: 400, stock: 100, lowStockLimit: 15, status: "active", isDeleted: false, images: [], tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { _id: prodId3, storeId, categoryId: catId2.toString(), sku: "CLTH-001", name: "T-Shirt", slug: "t-shirt", costPrice: 10, sellingPrice: 25, stock: 3, lowStockLimit: 5, status: "active", isDeleted: false, images: [], tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);

    // Create inventory records
    await db.collection("inventory").insertMany([
      { storeId: new ObjectId(storeId), productId: prodId1, currentStock: 50, lowStockLimit: 10, reservedStock: 0, availableStock: 50, costPrice: 500, lastRestockedAt: new Date(), lastSoldAt: new Date(), createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
      { storeId: new ObjectId(storeId), productId: prodId2, currentStock: 100, lowStockLimit: 15, reservedStock: 0, availableStock: 100, costPrice: 200, lastRestockedAt: new Date(), lastSoldAt: new Date(), createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
      { storeId: new ObjectId(storeId), productId: prodId3, currentStock: 3, lowStockLimit: 5, reservedStock: 0, availableStock: 3, costPrice: 10, lastRestockedAt: new Date(), lastSoldAt: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
    ]);

    // Create sales
    const saleId1 = new ObjectId();
    const saleId2 = new Date();
    const saleDate1 = new Date();
    saleDate1.setDate(saleDate1.getDate() - 1);
    const saleDate2 = new Date();

    await db.collection("sales").insertMany([
      {
        _id: saleId1, storeId, invoiceNumber: "INV-TEST-001", customerName: "John Doe", customerPhone: "1234567890",
        items: [{ productId: prodId1, name: "Laptop", sku: "ELEC-001", quantity: 2, unitPrice: 800, totalPrice: 1600 }],
        subtotal: 1600, discount: 0, tax: 0, shipping: 0, grandTotal: 1600, paidAmount: 1600, dueAmount: 0,
        paymentMethod: "cash", paymentStatus: "paid", status: "completed", notes: "", isDeleted: false,
        createdBy: userId.toString(), updatedBy: userId.toString(),
        createdAt: saleDate1.toISOString(), updatedAt: saleDate1.toISOString(),
      },
      {
        _id: new ObjectId(), storeId, invoiceNumber: "INV-TEST-002", customerName: "Jane Smith", customerPhone: "0987654321",
        items: [
          { productId: prodId2, name: "Phone", sku: "ELEC-002", quantity: 3, unitPrice: 400, totalPrice: 1200 },
          { productId: prodId3, name: "T-Shirt", sku: "CLTH-001", quantity: 5, unitPrice: 25, totalPrice: 125 },
        ],
        subtotal: 1325, discount: 25, tax: 0, shipping: 10, grandTotal: 1310, paidAmount: 1000, dueAmount: 310,
        paymentMethod: "card", paymentStatus: "partial", status: "completed", notes: "", isDeleted: false,
        createdBy: userId.toString(), updatedBy: userId.toString(),
        createdAt: saleDate2.toISOString(), updatedAt: saleDate2.toISOString(),
      },
    ]);

    // Create a return
    await db.collection("returns").insertOne({
      storeId, saleId: saleId1, invoiceNumber: "INV-TEST-001", customerName: "John Doe",
      items: [{ productId: prodId1, quantity: 1, unitPrice: 800, refundAmount: 800 }],
      subtotal: 800, refundAmount: 800, status: "completed", reason: "Defective", notes: "", isDeleted: false,
      createdBy: userId.toString(), updatedBy: userId.toString(),
      createdAt: saleDate2.toISOString(), updatedAt: saleDate2.toISOString(),
    });

    console.log(`Setup complete. Cookies: ${ownerCookies.length > 0 ? "obtained" : "none"}\n`);

    // ─── TEST 1: GET /api/v1/reports/dashboard-summary ───
    {
      const res = await request("GET", "/api/v1/reports/dashboard-summary", undefined, ownerCookies);
      console.log("DEBUG dashboard response:", JSON.stringify(res.body));
      const data = res.body as Record<string, unknown>;
      const success = data.success as boolean;
      const d = data.data as Record<string, unknown>;
      assert(
        "Dashboard summary returns success",
        success === true,
        `status=${res.status}, success=${success}`
      );
      assert(
        "Dashboard summary has required fields",
        d && typeof d.totalSales === "number" && typeof d.todaySales === "number" && typeof d.totalProducts === "number",
        `fields: totalSales=${d?.totalSales}, totalProducts=${d?.totalProducts}`
      );
    }

    // ─── TEST 2: GET /api/v1/reports/sales ───
    {
      const res = await request("GET", "/api/v1/reports/sales?period=thisMonth", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const success = data.success as boolean;
      const d = data.data as Record<string, unknown>;
      assert(
        "Sales report returns success",
        success === true,
        `status=${res.status}`
      );
      assert(
        "Sales report has correct totalSales",
        d && d.totalSales === 2,
        `totalSales=${d?.totalSales}`
      );
      assert(
        "Sales report has revenue data",
        d && typeof d.totalRevenue === "number" && (d.totalRevenue as number) > 0,
        `totalRevenue=${d?.totalRevenue}`
      );
      assert(
        "Sales report has dailyBreakdown array",
        d && Array.isArray(d.dailyBreakdown),
        `dailyBreakdown length=${(d?.dailyBreakdown as unknown[])?.length}`
      );
    }

    // ─── TEST 3: GET /api/v1/reports/sales with date range ───
    {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 2);
      const today = new Date();
      const startStr = yesterday.toISOString().substring(0, 10);
      const endStr = today.toISOString().substring(0, 10);

      const res = await request("GET", `/api/v1/reports/sales?startDate=${startStr}&endDate=${endStr}T23:59:59.999Z`, undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      assert(
        "Sales report with date range returns success",
        data.success === true,
        `status=${res.status}`
      );
    }

    // ─── TEST 4: GET /api/v1/reports/top-products ───
    {
      const res = await request("GET", "/api/v1/reports/top-products?period=thisMonth", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const success = data.success as boolean;
      const d = data.data as unknown[];
      assert(
        "Top products returns success",
        success === true,
        `status=${res.status}`
      );
      assert(
        "Top products returns array",
        Array.isArray(d),
        `length=${d?.length}`
      );
      if (d && d.length > 0) {
        const first = d[0] as Record<string, unknown>;
        assert(
          "Top product has required fields",
          typeof first.productId === "string" && typeof first.name === "string" && typeof first.totalRevenue === "number",
          `first: ${first.name}, revenue=${first.totalRevenue}`
        );
      }
    }

    // ─── TEST 5: GET /api/v1/reports/top-categories ───
    {
      const res = await request("GET", "/api/v1/reports/top-categories?period=thisMonth", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      assert(
        "Top categories returns success",
        data.success === true,
        `status=${res.status}`
      );
      const d = data.data as unknown[];
      assert(
        "Top categories returns array",
        Array.isArray(d),
        `length=${d?.length}`
      );
    }

    // ─── TEST 6: GET /api/v1/reports/top-customers ───
    {
      const res = await request("GET", "/api/v1/reports/top-customers?period=thisMonth", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      assert(
        "Top customers returns success",
        data.success === true,
        `status=${res.status}`
      );
      const d = data.data as unknown[];
      assert(
        "Top customers returns array",
        Array.isArray(d),
        `length=${d?.length}`
      );
      if (d && d.length > 0) {
        const first = d[0] as Record<string, unknown>;
        assert(
          "Top customer has required fields",
          typeof first.customerName === "string" && typeof first.totalSpent === "number",
          `first: ${first.customerName}, spent=${first.totalSpent}`
        );
      }
    }

    // ─── TEST 7: GET /api/v1/reports/best-cashiers ───
    {
      const res = await request("GET", "/api/v1/reports/best-cashiers?period=thisMonth", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      assert(
        "Best cashiers returns success",
        data.success === true,
        `status=${res.status}`
      );
      const d = data.data as unknown[];
      assert(
        "Best cashiers returns array",
        Array.isArray(d),
        `length=${d?.length}`
      );
    }

    // ─── TEST 8: GET /api/v1/reports/sales-by-payment-method ───
    {
      const res = await request("GET", "/api/v1/reports/sales-by-payment-method?period=thisMonth", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      assert(
        "Sales by payment method returns success",
        data.success === true,
        `status=${res.status}`
      );
      const d = data.data as unknown[];
      assert(
        "Sales by payment method returns array with 2 methods",
        Array.isArray(d) && d.length === 2,
        `methods=${d?.length}`
      );
    }

    // ─── TEST 9: GET /api/v1/reports/sales-by-day ───
    {
      const res = await request("GET", "/api/v1/reports/sales-by-day?period=thisMonth", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      assert(
        "Sales by day returns success",
        data.success === true,
        `status=${res.status}`
      );
      const d = data.data as unknown[];
      assert(
        "Sales by day returns array",
        Array.isArray(d),
        `days=${d?.length}`
      );
    }

    // ─── TEST 10: GET /api/v1/reports/sales-by-month ───
    {
      const res = await request("GET", "/api/v1/reports/sales-by-month?period=thisYear", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      assert(
        "Sales by month returns success",
        data.success === true,
        `status=${res.status}`
      );
      const d = data.data as unknown[];
      assert(
        "Sales by month returns array",
        Array.isArray(d),
        `months=${d?.length}`
      );
    }

    // ─── TEST 11: GET /api/v1/reports/inventory-value ───
    {
      const res = await request("GET", "/api/v1/reports/inventory-value", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const success = data.success as boolean;
      const d = data.data as Record<string, unknown>;
      assert(
        "Inventory value returns success",
        success === true,
        `status=${res.status}`
      );
      assert(
        "Inventory value has required fields",
        d && typeof d.totalProducts === "number" && typeof d.totalInventoryValue === "number",
        `totalProducts=${d?.totalProducts}, totalInventoryValue=${d?.totalInventoryValue}`
      );
    }

    // ─── TEST 12: GET /api/v1/reports/low-stock ───
    {
      const res = await request("GET", "/api/v1/reports/low-stock", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      assert(
        "Low stock returns success",
        data.success === true,
        `status=${res.status}`
      );
      const d = data.data as unknown[];
      assert(
        "Low stock returns array with 1 item (T-Shirt)",
        Array.isArray(d) && d.length === 1,
        `count=${d?.length}`
      );
      if (d && d.length > 0) {
        const item = d[0] as Record<string, unknown>;
        assert(
          "Low stock item is T-Shirt",
          item.name === "T-Shirt" && item.sku === "CLTH-001",
          `name=${item.name}, sku=${item.sku}`
        );
      }
    }

    // ─── TEST 13: GET /api/v1/reports/dead-stock ───
    {
      const res = await request("GET", "/api/v1/reports/dead-stock", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      assert(
        "Dead stock returns success",
        data.success === true,
        `status=${res.status}`
      );
      const d = data.data as unknown[];
      assert(
        "Dead stock returns array",
        Array.isArray(d),
        `count=${d?.length}`
      );
    }

    // ─── TEST 14: GET /api/v1/reports/profit ───
    {
      const res = await request("GET", "/api/v1/reports/profit?period=thisMonth", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const success = data.success as boolean;
      const d = data.data as Record<string, unknown>;
      assert(
        "Profit report returns success",
        success === true,
        `status=${res.status}`
      );
      assert(
        "Profit report has required fields",
        d && typeof d.totalRevenue === "number" && typeof d.totalCost === "number" && typeof d.totalProfit === "number" && typeof d.profitMargin === "number",
        `revenue=${d?.totalRevenue}, cost=${d?.totalCost}, profit=${d?.totalProfit}, margin=${d?.profitMargin}%`
      );
    }

    // ─── TEST 15: GET /api/v1/reports/most-returned ───
    {
      const res = await request("GET", "/api/v1/reports/most-returned?period=thisMonth", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      assert(
        "Most returned products returns success",
        data.success === true,
        `status=${res.status}`
      );
      const d = data.data as unknown[];
      assert(
        "Most returned returns array with 1 item",
        Array.isArray(d) && d.length === 1,
        `count=${d?.length}`
      );
    }

    // ─── TEST 16: Multi-tenant isolation ───
    {
      // Create another store
      const otherUserId = new ObjectId();
      const otherStoreId = new ObjectId();
      await db.collection("user").insertOne({
        _id: otherUserId, name: "Other", email: "other@test.com", emailVerified: true,
        role: "owner", storeId: otherStoreId.toString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await db.collection("stores").insertOne({
        _id: otherStoreId, userId: otherUserId.toString(), name: "Other Store", slug: "other-store",
        status: "approved", plan: "pro", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      const otherSessionId = new ObjectId();
      const otherToken = "test-session-other-reports-" + Date.now();
      await db.collection("session").insertOne({
        _id: otherSessionId, userId: otherUserId.toString(), token: otherToken,
        expiresAt: new Date(Date.now() + 86400000), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await db.collection("staff").insertOne({
        storeId: otherStoreId.toString(), userId: otherUserId.toString(), name: "Other",
        email: "other@test.com", role: "owner", permissions: ["reports"],
        status: "active", invitedBy: otherUserId.toString(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });

      const otherCookies = [`session=${otherToken}`];

      const res = await request("GET", "/api/v1/reports/dashboard-summary", undefined, otherCookies);
      const data = res.body as Record<string, unknown>;
      const d = data.data as Record<string, unknown>;
      assert(
        "Multi-tenant: other store sees own data",
        data.success === true && d.totalSales === 0,
        `other store totalSales=${d?.totalSales}`
      );
    }

    // ─── TEST 17: Unauthenticated access blocked ───
    {
      const res = await request("GET", "/api/v1/reports/dashboard-summary");
      assert(
        "Unauthenticated access returns 401",
        res.status === 401,
        `status=${res.status}`
      );
    }

    // ─── TEST 18: Permission check ───
    {
      // Create user without reports permission
      const noPermUserId = new ObjectId();
      const noPermSessionId = new ObjectId();
      const noPermToken = "test-session-noperm-reports-" + Date.now();
      await db.collection("user").insertOne({
        _id: noPermUserId, name: "NoPerm", email: "noperm@test.com", emailVerified: true,
        role: "staff", storeId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await db.collection("session").insertOne({
        _id: noPermSessionId, userId: noPermUserId.toString(), token: noPermToken,
        expiresAt: new Date(Date.now() + 86400000), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await db.collection("staff").insertOne({
        storeId, userId: noPermUserId.toString(), name: "NoPerm", email: "noperm@test.com",
        role: "staff", permissions: ["products"], status: "active", invitedBy: userId.toString(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });

      const noPermCookies = [`session=${noPermToken}`];
      const res = await request("GET", "/api/v1/reports/dashboard-summary", undefined, noPermCookies);
      assert(
        "User without reports permission gets 403",
        res.status === 403,
        `status=${res.status}`
      );
    }

    // ─── TEST 19: Period filters ───
    {
      const periods = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "thisYear", "lastYear"];
      let allPassed = true;
      for (const period of periods) {
        const res = await request("GET", `/api/v1/reports/sales?period=${period}`, undefined, ownerCookies);
        if (res.status !== 200 || !(res.body as Record<string, unknown>).success) {
          allPassed = false;
          assert(`Period filter '${period}'`, false, `status=${res.status}`);
          break;
        }
      }
      if (allPassed) {
        assert("All period filters work", true, "8 periods tested successfully");
      }
    }

    // ─── TEST 20: limit parameter ───
    {
      const res = await request("GET", "/api/v1/reports/top-products?period=thisMonth&limit=1", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const d = data.data as unknown[];
      assert(
        "Limit parameter works",
        data.success === true && Array.isArray(d) && d.length <= 1,
        `returned=${d?.length}`
      );
    }

  } catch (error) {
    console.error("Test setup error:", error);
    assert("Test setup", false, String(error));
  } finally {
    if (server) server.close();
    if (client) await client.close();
    if (mongoServer) await mongoServer.stop();
  }

  // ─── SUMMARY ───
  console.log("\n========== TEST SUMMARY ==========\n");
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    console.log("Failed tests:");
    results.filter((r) => !r.pass).forEach((r) => console.log(`  FAIL: ${r.name} - ${r.detail}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
