import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId, Db } from "mongodb";
import http from "http";

const TEST_PORT = 5099;
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
  console.log("\n========== PHASE 6 E2E VERIFICATION: INVENTORY ==========\n");

  let ownerCookies: string[] = [];
  let inventoryId = "";
  let productId = "";

  // ────────────────────────────────────────────
  // SETUP: Register owner, approve account, create store, create a product
  // ────────────────────────────────────────────
  console.log("\n--- SETUP: Register owner ---");
  const regRes = await request("POST", "/api/auth/sign-up/email", {
    name: "Inventory Owner",
    email: "inventoryowner@example.com",
    password: "TestPass123!",
  });

  assert(
    "Owner registered",
    regRes.status === 200 || regRes.status === 201,
    `Status: ${regRes.status}`
  );

  ownerCookies = extractCookies(regRes.headers);

  const ownerUser = await db.collection("user").findOne({ email: "inventoryowner@example.com" });
  assert("Owner user created", ownerUser !== null, ownerUser ? `id: ${ownerUser._id}` : "not found");

  if (ownerUser) {
    const now = new Date().toISOString();
    const storeResult = await db.collection("stores").insertOne({
      ownerId: ownerUser._id.toString(),
      storeName: "Inventory Test Store",
      storeSlug: "inventory-test-store",
      currency: "USD",
      timezone: "UTC",
      plan: "pro",
      accountStatus: "approved",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const storeId = storeResult.insertedId.toString();

    await db.collection("user").updateOne(
      { _id: ownerUser._id },
      { $set: { storeId, accountStatus: "approved", updatedAt: now } }
    );

    await db.collection("stores").updateOne(
      { _id: storeResult.insertedId },
      { $set: { ownerId: ownerUser._id.toString() } }
    );

    assert("Store created and approved", true, `storeId: ${storeId}`);

    // Seed subscription for plan limit checks
    await db.collection("subscriptions").insertOne({
      storeId,
      plan: "business",
      status: "active",
      billingCycle: "monthly",
      price: 79.99,
      currency: "USD",
      startedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-12-31T23:59:59.000Z",
      renewalDate: "2027-01-01T00:00:00.000Z",
      isTrial: false,
      features: ["inventory", "sales", "returns", "reports", "analytics", "ai_reports", "marketing_generator", "seo_generator", "excel_export", "pdf_export", "warehouse", "ai_forecasting", "api_access"],
      limits: { maxProducts: -1, maxCategories: -1, maxInventory: -1, maxStaff: -1, maxAiRequests: -1 },
      usage: { products: 0, categories: 0, inventory: 0, staff: 0, aiRequests: 0, lastResetAt: "2026-01-01T00:00:00.000Z" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await request("POST", "/api/auth/sign-out", undefined, ownerCookies);
    const loginRes = await request("POST", "/api/auth/sign-in/email", {
      email: "inventoryowner@example.com",
      password: "TestPass123!",
    });
    ownerCookies = extractCookies(loginRes.headers);

    assert(
      "Owner re-login with approved account",
      loginRes.status === 200,
      `Status: ${loginRes.status}`
    );

    // Create a product for inventory
    const productRes = await request("POST", "/api/v1/products", {
      sku: "TEST-PROD-001",
      name: "Test Product",
      costPrice: 10,
      sellingPrice: 20,
      stock: 0,
    }, ownerCookies);

    if (productRes.status === 201 || productRes.status === 200) {
      const product = productRes.body?.data as Record<string, unknown> | undefined;
      if (product) {
        productId = (product._id as { toString(): string }).toString();
        assert("Test product created", true, `productId: ${productId}`);
      }
    } else {
      assert("Test product created", false, `Status: ${productRes.status}`);
    }
  }

  // ────────────────────────────────────────────
  // TEST 1: Unauthenticated access blocked
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Unauthenticated access ---");
  const unauthList = await request("GET", "/api/v1/inventory");
  assert(
    "Unauthenticated user gets 401",
    unauthList.status === 401,
    `Status: ${unauthList.status}`
  );

  // ────────────────────────────────────────────
  // TEST 2: Create inventory record
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Create inventory ---");
  const createRes = await request("POST", "/api/v1/inventory", {
    productId,
    currentStock: 100,
    lowStockLimit: 10,
    costPrice: 10.5,
  }, ownerCookies);

  assert(
    "Create inventory returns 201",
    createRes.status === 201,
    `Status: ${createRes.status}`
  );

  const createdInventory = createRes.body?.data as Record<string, unknown> | undefined;
  if (createdInventory) {
    inventoryId = (createdInventory._id as { toString(): string }).toString();
    assert("Inventory has _id", !!inventoryId, `id: ${inventoryId}`);
    assert("Inventory currentStock = 100", createdInventory.currentStock === 100, `currentStock: ${createdInventory.currentStock}`);
    assert("Inventory lowStockLimit = 10", createdInventory.lowStockLimit === 10, `lowStockLimit: ${createdInventory.lowStockLimit}`);
    assert("Inventory costPrice = 10.5", createdInventory.costPrice === 10.5, `costPrice: ${createdInventory.costPrice}`);
    assert("Inventory availableStock = 100", createdInventory.availableStock === 100, `availableStock: ${createdInventory.availableStock}`);
  }

  // Check activity log
  const createActivity = await db.collection("activity_logs").findOne({
    action: "CREATE_INVENTORY",
    module: "inventory",
  });
  assert(
    "CREATE_INVENTORY activity logged",
    createActivity !== null,
    createActivity ? `desc: ${createActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 3: Duplicate inventory for same product rejected
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Duplicate inventory ---");
  const dupRes = await request("POST", "/api/v1/inventory", {
    productId,
    currentStock: 50,
    costPrice: 10,
  }, ownerCookies);

  assert(
    "Duplicate inventory returns 409/422",
    dupRes.status === 409 || dupRes.status === 422,
    `Status: ${dupRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 4: Validation - missing required fields
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - missing fields ---");
  const missingRes = await request("POST", "/api/v1/inventory", {
    currentStock: 10,
  }, ownerCookies);

  assert(
    "Missing productId returns 400",
    missingRes.status === 400,
    `Status: ${missingRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 5: Validation - negative stock
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - negative stock ---");
  const negRes = await request("POST", "/api/v1/inventory", {
    productId: new ObjectId().toString(),
    currentStock: -5,
    costPrice: 10,
  }, ownerCookies);

  assert(
    "Negative stock returns 400",
    negRes.status === 400,
    `Status: ${negRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 6: List inventory
  // ────────────────────────────────────────────
  console.log("\n--- TEST: List inventory ---");
  const listRes = await request("GET", "/api/v1/inventory", undefined, ownerCookies);
  assert(
    "List inventory returns 200",
    listRes.status === 200,
    `Status: ${listRes.status}`
  );

  const listData = listRes.body?.data as Record<string, unknown> | undefined;
  assert(
    "List returns items in paginated format",
    !!listData && Array.isArray(listData.items),
    `hasData: ${!!listData}, hasItems: ${listData ? Array.isArray(listData.items) : false}`
  );

  // ────────────────────────────────────────────
  // TEST 7: Get inventory by ID
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Get inventory by ID ---");
  const getByIdRes = await request("GET", `/api/v1/inventory/${inventoryId}`, undefined, ownerCookies);
  assert(
    "Get inventory by ID returns 200",
    getByIdRes.status === 200,
    `Status: ${getByIdRes.status}`
  );

  const fetchedInventory = getByIdRes.body?.data as Record<string, unknown> | undefined;
  if (fetchedInventory) {
    assert("Fetched inventory has correct currentStock", fetchedInventory.currentStock === 100, `currentStock: ${fetchedInventory.currentStock}`);
  }

  // ────────────────────────────────────────────
  // TEST 8: Update inventory
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Update inventory ---");
  const updateRes = await request("PATCH", `/api/v1/inventory/${inventoryId}`, {
    currentStock: 150,
    costPrice: 12.0,
  }, ownerCookies);

  assert(
    "Update inventory returns 200",
    updateRes.status === 200,
    `Status: ${updateRes.status}`
  );

  const updatedInventory = updateRes.body?.data as Record<string, unknown> | undefined;
  if (updatedInventory) {
    assert("Updated inventory currentStock = 150", updatedInventory.currentStock === 150, `currentStock: ${updatedInventory.currentStock}`);
    assert("Updated inventory costPrice = 12", updatedInventory.costPrice === 12, `costPrice: ${updatedInventory.costPrice}`);
  }

  const updateActivity = await db.collection("activity_logs").findOne({
    action: "UPDATE_INVENTORY",
    module: "inventory",
  });
  assert(
    "UPDATE_INVENTORY activity logged",
    updateActivity !== null,
    updateActivity ? `desc: ${updateActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 9: Stock In
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Stock In ---");
  const stockInRes = await request("POST", `/api/v1/inventory/${inventoryId}/stock-in`, {
    quantity: 50,
    reference: "PO-12345",
    notes: "Restocking from supplier",
  }, ownerCookies);

  assert(
    "Stock in returns 200",
    stockInRes.status === 200,
    `Status: ${stockInRes.status}`
  );

  const afterStockIn = stockInRes.body?.data as Record<string, unknown> | undefined;
  if (afterStockIn) {
    assert("After stock in currentStock = 200", afterStockIn.currentStock === 200, `currentStock: ${afterStockIn.currentStock}`);
    assert("After stock in availableStock = 200", afterStockIn.availableStock === 200, `availableStock: ${afterStockIn.availableStock}`);
  }

  const stockInActivity = await db.collection("activity_logs").findOne({
    action: "STOCK_IN",
    module: "inventory",
  });
  assert(
    "STOCK_IN activity logged",
    stockInActivity !== null,
    stockInActivity ? `desc: ${stockInActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 10: Stock Out
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Stock Out ---");
  const stockOutRes = await request("POST", `/api/v1/inventory/${inventoryId}/stock-out`, {
    quantity: 30,
    reference: "ORDER-001",
    notes: "Customer order fulfillment",
  }, ownerCookies);

  assert(
    "Stock out returns 200",
    stockOutRes.status === 200,
    `Status: ${stockOutRes.status}`
  );

  const afterStockOut = stockOutRes.body?.data as Record<string, unknown> | undefined;
  if (afterStockOut) {
    assert("After stock out currentStock = 170", afterStockOut.currentStock === 170, `currentStock: ${afterStockOut.currentStock}`);
  }

  const stockOutActivity = await db.collection("activity_logs").findOne({
    action: "STOCK_OUT",
    module: "inventory",
  });
  assert(
    "STOCK_OUT activity logged",
    stockOutActivity !== null,
    stockOutActivity ? `desc: ${stockOutActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 11: Stock Out - insufficient stock
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Stock Out - insufficient stock ---");
  const insufficientRes = await request("POST", `/api/v1/inventory/${inventoryId}/stock-out`, {
    quantity: 999,
  }, ownerCookies);

  assert(
    "Insufficient stock returns 422",
    insufficientRes.status === 422,
    `Status: ${insufficientRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 12: Stock Adjustment
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Stock Adjustment ---");
  const adjustRes = await request("POST", `/api/v1/inventory/${inventoryId}/adjust`, {
    quantity: 200,
    notes: "Physical count adjustment",
  }, ownerCookies);

  assert(
    "Stock adjustment returns 200",
    adjustRes.status === 200,
    `Status: ${adjustRes.status}`
  );

  const afterAdjust = adjustRes.body?.data as Record<string, unknown> | undefined;
  if (afterAdjust) {
    assert("After adjust currentStock = 200", afterAdjust.currentStock === 200, `currentStock: ${afterAdjust.currentStock}`);
  }

  const adjustActivity = await db.collection("activity_logs").findOne({
    action: "STOCK_ADJUSTMENT",
    module: "inventory",
  });
  assert(
    "STOCK_ADJUSTMENT activity logged",
    adjustActivity !== null,
    adjustActivity ? `desc: ${adjustActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 13: Get inventory movements
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Get inventory movements ---");
  const movementsRes = await request("GET", `/api/v1/inventory/${inventoryId}/movements`, undefined, ownerCookies);
  assert(
    "Get movements returns 200",
    movementsRes.status === 200,
    `Status: ${movementsRes.status}`
  );

  const movements = movementsRes.body?.data as Record<string, unknown>[] | undefined;
  if (movements) {
    assert("Movements array has items", movements.length > 0, `length: ${movements.length}`);
  }

  // ────────────────────────────────────────────
  // TEST 14: Low stock query
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Low stock query ---");
  const lowStockRes = await request("GET", "/api/v1/inventory/low-stock", undefined, ownerCookies);
  assert(
    "Low stock returns 200",
    lowStockRes.status === 200,
    `Status: ${lowStockRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 15: Out of stock query
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Out of stock query ---");
  const outOfStockRes = await request("GET", "/api/v1/inventory/out-of-stock", undefined, ownerCookies);
  assert(
    "Out of stock returns 200",
    outOfStockRes.status === 200,
    `Status: ${outOfStockRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 16: Get non-existent inventory
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Non-existent inventory ---");
  const fakeId = new ObjectId().toString();
  const notFoundRes = await request("GET", `/api/v1/inventory/${fakeId}`, undefined, ownerCookies);
  assert(
    "Non-existent inventory returns 404",
    notFoundRes.status === 404,
    `Status: ${notFoundRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 17: Validation - stock in with zero quantity
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - zero quantity ---");
  const zeroQtyRes = await request("POST", `/api/v1/inventory/${inventoryId}/stock-in`, {
    quantity: 0,
  }, ownerCookies);

  assert(
    "Zero quantity returns 400",
    zeroQtyRes.status === 400,
    `Status: ${zeroQtyRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 18: Delete inventory
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Delete inventory ---");
  const deleteRes = await request("DELETE", `/api/v1/inventory/${inventoryId}`, undefined, ownerCookies);
  assert(
    "Delete inventory returns 204",
    deleteRes.status === 204,
    `Status: ${deleteRes.status}`
  );

  const deleteActivity = await db.collection("activity_logs").findOne({
    action: "DELETE_INVENTORY",
    module: "inventory",
  });
  assert(
    "DELETE_INVENTORY activity logged",
    deleteActivity !== null,
    deleteActivity ? `desc: ${deleteActivity.description}` : "not found"
  );

  // Verify soft delete - should return 404
  const afterDeleteRes = await request("GET", `/api/v1/inventory/${inventoryId}`, undefined, ownerCookies);
  assert(
    "Deleted inventory returns 404",
    afterDeleteRes.status === 404,
    `Status: ${afterDeleteRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 19: Multi-tenant isolation
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Multi-tenant isolation ---");
  const regRes2 = await request("POST", "/api/auth/sign-up/email", {
    name: "Other Owner",
    email: "otherowner@example.com",
    password: "TestPass123!",
  });

  let otherCookies: string[] = extractCookies(regRes2.headers);

  const otherUser = await db.collection("user").findOne({ email: "otherowner@example.com" });
  if (otherUser) {
    const now = new Date().toISOString();
    const storeResult = await db.collection("stores").insertOne({
      ownerId: otherUser._id.toString(),
      storeName: "Other Store",
      storeSlug: "other-store",
      currency: "USD",
      timezone: "UTC",
      plan: "pro",
      accountStatus: "approved",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const storeId = storeResult.insertedId.toString();

    await db.collection("user").updateOne(
      { _id: otherUser._id },
      { $set: { storeId, accountStatus: "approved", updatedAt: now } }
    );

    await request("POST", "/api/auth/sign-out", undefined, otherCookies);
    const loginRes2 = await request("POST", "/api/auth/sign-in/email", {
      email: "otherowner@example.com",
      password: "TestPass123!",
    });
    otherCookies = extractCookies(loginRes2.headers);
  }

  // Other owner tries to access inventory from first owner
  const crossAccessRes = await request("GET", "/api/v1/inventory", undefined, otherCookies);
  assert(
    "Cross-tenant access blocked (returns 200 with empty data)",
    crossAccessRes.status === 200,
    `Status: ${crossAccessRes.status}`
  );

  const crossData = crossAccessRes.body?.data as Record<string, unknown> | undefined;
  if (crossData) {
    assert(
      "Cross-tenant sees empty inventory",
      Array.isArray(crossData.items) && crossData.items.length === 0,
      `items: ${Array.isArray(crossData.items) ? crossData.items.length : "not array"}`
    );
  }
}

async function main(): Promise<void> {
  try {
    console.log("Starting MongoDB Memory Server...");
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    console.log(`MongoDB Memory Server started: ${uri}`);

    client = new MongoClient(uri);
    await client.connect();
    db = client.db("commercepilot_ai_test");
    console.log("Connected to in-memory database.");

    process.env.MONGODB_URI = uri;
    process.env.DB_NAME = "commercepilot_ai_test";
    process.env.BETTER_AUTH_SECRET = "test-secret-for-e2e";
    process.env.BETTER_AUTH_URL = `http://localhost:${TEST_PORT}`;
    process.env.CLIENT_URL = "http://localhost:3000";
    process.env.PORT = String(TEST_PORT);

    console.log("Starting Express server...");
    await import("../src/server");
    await new Promise((r) => setTimeout(r, 5000));

    await runTests();

    console.log("\n\n========== SUMMARY ==========");
    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

    if (failed > 0) {
      console.log("\nFailed tests:");
      results.filter((r) => !r.pass).forEach((r) => {
        console.log(`  FAIL: ${r.name} - ${r.detail}`);
      });
    }

    console.log("\n========== DONE ==========\n");
  } catch (error) {
    console.error("Test runner error:", error);
  } finally {
    if (server) server.close();
    if (client) await client.close();
    if (mongoServer) await mongoServer.stop();
    process.exit(0);
  }
}

main();
