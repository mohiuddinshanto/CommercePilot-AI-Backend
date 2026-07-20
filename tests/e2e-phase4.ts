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
        "Origin": "http://localhost:3000",
        "Referer": "http://localhost:3000/",
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
  console.log("\n========== PHASE 4 E2E VERIFICATION: PRODUCTS ==========\n");

  let ownerCookies: string[] = [];
  let productId = "";

  // ────────────────────────────────────────────
  // SETUP: Register owner, approve account, create store
  // ────────────────────────────────────────────
  console.log("\n--- SETUP: Register owner ---");
  const regRes = await request("POST", "/api/auth/sign-up/email", {
    name: "Product Owner",
    email: "productowner@example.com",
    password: "TestPass123!",
  });

  assert(
    "Owner registered",
    regRes.status === 200 || regRes.status === 201,
    `Status: ${regRes.status}`
  );

  ownerCookies = extractCookies(regRes.headers);

  // Find owner user and create store
  const ownerUser = await db.collection("user").findOne({ email: "productowner@example.com" });
  assert("Owner user created", ownerUser !== null, ownerUser ? `id: ${ownerUser._id}` : "not found");

  if (ownerUser) {
    // Create a store for the owner
    const now = new Date().toISOString();
    const storeResult = await db.collection("stores").insertOne({
      ownerId: ownerUser._id.toString(),
      storeName: "Product Test Store",
      storeSlug: "product-test-store",
      currency: "USD",
      timezone: "UTC",
      plan: "pro",
      accountStatus: "approved",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const storeId = storeResult.insertedId.toString();

    // Update user with storeId and approved status
    await db.collection("user").updateOne(
      { _id: ownerUser._id },
      { $set: { storeId, accountStatus: "approved", updatedAt: now } }
    );

    // Update store with correct ownerId
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

    // Re-login to get fresh session with updated user
    await request("POST", "/api/auth/sign-out", undefined, ownerCookies);
    const loginRes = await request("POST", "/api/auth/sign-in/email", {
      email: "productowner@example.com",
      password: "TestPass123!",
    });
    ownerCookies = extractCookies(loginRes.headers);

    assert(
      "Owner re-login with approved account",
      loginRes.status === 200,
      `Status: ${loginRes.status}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 1: Unauthenticated access blocked
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Unauthenticated access ---");
  const unauthList = await request("GET", "/api/v1/products");
  assert(
    "Unauthenticated user gets 401",
    unauthList.status === 401,
    `Status: ${unauthList.status}`
  );

  // ────────────────────────────────────────────
  // TEST 2: Create product
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Create product ---");
  const createRes = await request("POST", "/api/v1/products", {
    sku: "PANJABI-001",
    name: "Premium Panjabi",
    description: "A high-quality panjabi for Eid.",
    costPrice: 1500,
    sellingPrice: 2200,
    stock: 120,
    lowStockLimit: 10,
    status: "active",
    tags: ["panjabi", "premium", "cotton"],
  }, ownerCookies);

  assert(
    "Create product returns 201",
    createRes.status === 201,
    `Status: ${createRes.status}, body: ${JSON.stringify(createRes.body).substring(0, 200)}`
  );

  const createdProduct = createRes.body?.data as Record<string, unknown> | undefined;
  if (createdProduct) {
    productId = (createdProduct._id as { toString(): string }).toString();
    assert("Product has _id", !!productId, `id: ${productId}`);
    assert("Product sku = PANJABI-001", createdProduct.sku === "PANJABI-001", `sku: ${createdProduct.sku}`);
    assert("Product name = Premium Panjabi", createdProduct.name === "Premium Panjabi", `name: ${createdProduct.name}`);
    assert("Product costPrice = 1500", createdProduct.costPrice === 1500, `costPrice: ${createdProduct.costPrice}`);
    assert("Product sellingPrice = 2200", createdProduct.sellingPrice === 2200, `sellingPrice: ${createdProduct.sellingPrice}`);
    assert("Product stock = 120", createdProduct.stock === 120, `stock: ${createdProduct.stock}`);
    assert("Product status = active", createdProduct.status === "active", `status: ${createdProduct.status}`);
    assert("Product tags include panjabi", (createdProduct.tags as string[]).includes("panjabi"), `tags: ${JSON.stringify(createdProduct.tags)}`);
  }

  // Check activity log
  const createActivity = await db.collection("activity_logs").findOne({
    action: "CREATE_PRODUCT",
    module: "products",
  });
  assert(
    "CREATE_PRODUCT activity logged",
    createActivity !== null,
    createActivity ? `desc: ${createActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 3: Duplicate SKU rejected
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Duplicate SKU ---");
  const dupRes = await request("POST", "/api/v1/products", {
    sku: "PANJABI-001",
    name: "Duplicate Panjabi",
    costPrice: 1000,
    sellingPrice: 1500,
    stock: 50,
  }, ownerCookies);

  assert(
    "Duplicate SKU returns 409",
    dupRes.status === 409,
    `Status: ${dupRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 4: Validation - missing required fields
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - missing fields ---");
  const validRes = await request("POST", "/api/v1/products", {
    name: "No SKU Product",
  }, ownerCookies);

  assert(
    "Missing required fields returns 400",
    validRes.status === 400,
    `Status: ${validRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 5: List products
  // ────────────────────────────────────────────
  console.log("\n--- TEST: List products ---");
  const listRes = await request("GET", "/api/v1/products", undefined, ownerCookies);

  assert(
    "List products returns 200",
    listRes.status === 200,
    `Status: ${listRes.status}`
  );

  const listData = listRes.body?.data as Record<string, unknown> | undefined;
  if (listData) {
    const items = listData.items as unknown[];
    assert(
      "List returns items array",
      Array.isArray(items),
      `items: ${Array.isArray(items) ? items.length : "not array"}`
    );
    assert(
      "List returns at least 1 product",
      items.length >= 1,
      `count: ${items.length}`
    );
    assert(
      "List returns pagination",
      !!listData.pagination,
      `pagination: ${JSON.stringify(listData.pagination)}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 6: Search products
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Search products ---");
  const searchRes = await request("GET", "/api/v1/products?search=Panjabi", undefined, ownerCookies);

  assert(
    "Search returns 200",
    searchRes.status === 200,
    `Status: ${searchRes.status}`
  );

  const searchData = searchRes.body?.data as Record<string, unknown> | undefined;
  if (searchData) {
    const items = searchData.items as Record<string, unknown>[];
    assert(
      "Search finds Panjabi product",
      items.length >= 1,
      `found: ${items.length}`
    );
    assert(
      "Search result contains correct product",
      items[0]?.name === "Premium Panjabi",
      `name: ${items[0]?.name}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 7: Get product by ID
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Get product by ID ---");
  if (productId) {
    const getRes = await request("GET", `/api/v1/products/${productId}`, undefined, ownerCookies);

    assert(
      "Get product returns 200",
      getRes.status === 200,
      `Status: ${getRes.status}`
    );

    const product = getRes.body?.data as Record<string, unknown>;
    if (product) {
      assert(
        "Get returns correct product",
        product.name === "Premium Panjabi",
        `name: ${product.name}`
      );
    }
  }

  // ────────────────────────────────────────────
  // TEST 8: Update product
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Update product ---");
  if (productId) {
    const updateRes = await request("PATCH", `/api/v1/products/${productId}`, {
      name: "Premium Panjabi V2",
      sellingPrice: 2500,
      stock: 100,
    }, ownerCookies);

    assert(
      "Update product returns 200",
      updateRes.status === 200,
      `Status: ${updateRes.status}`
    );

    const updated = updateRes.body?.data as Record<string, unknown>;
    if (updated) {
      assert(
        "Updated name = Premium Panjabi V2",
        updated.name === "Premium Panjabi V2",
        `name: ${updated.name}`
      );
      assert(
        "Updated sellingPrice = 2500",
        updated.sellingPrice === 2500,
        `sellingPrice: ${updated.sellingPrice}`
      );
      assert(
        "Updated stock = 100",
        updated.stock === 100,
        `stock: ${updated.stock}`
      );
    }

    // Check update activity log
    const updateActivity = await db.collection("activity_logs").findOne({
      action: "UPDATE_PRODUCT",
      module: "products",
    });
    assert(
      "UPDATE_PRODUCT activity logged",
      updateActivity !== null,
      updateActivity ? `desc: ${updateActivity.description}` : "not found"
    );
  }

  // ────────────────────────────────────────────
  // TEST 9: Delete product with stock fails
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Delete with stock fails ---");
  if (productId) {
    const deleteStockRes = await request("DELETE", `/api/v1/products/${productId}`, undefined, ownerCookies);

    assert(
      "Delete with stock returns 422",
      deleteStockRes.status === 422,
      `Status: ${deleteStockRes.status}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 10: Set stock to 0 and delete
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Delete after stock = 0 ---");
  if (productId) {
    // Set stock to 0
    await request("PATCH", `/api/v1/products/${productId}`, {
      stock: 0,
    }, ownerCookies);

    const deleteRes = await request("DELETE", `/api/v1/products/${productId}`, undefined, ownerCookies);

    assert(
      "Delete returns 204 (soft delete)",
      deleteRes.status === 204,
      `Status: ${deleteRes.status}`
    );

    // Verify soft deleted - should not be in list
    const afterDelete = await request("GET", `/api/v1/products/${productId}`, undefined, ownerCookies);
    assert(
      "Deleted product not found (soft deleted)",
      afterDelete.status === 404,
      `Status: ${afterDelete.status}`
    );

    // Check activity log
    const deleteActivity = await db.collection("activity_logs").findOne({
      action: "DELETE_PRODUCT",
      module: "products",
    });
    assert(
      "DELETE_PRODUCT activity logged",
      deleteActivity !== null,
      deleteActivity ? `desc: ${deleteActivity.description}` : "not found"
    );

    // Verify isDeleted in database
    const dbProduct = await db.collection("products").findOne({ _id: new ObjectId(productId) });
    if (dbProduct) {
      assert(
        "Product isDeleted = true in DB",
        dbProduct.isDeleted === true,
        `isDeleted: ${dbProduct.isDeleted}`
      );
    }
  }

  // ────────────────────────────────────────────
  // TEST 11: Low stock products
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Low stock products ---");
  // Create a low stock product
  const lowStockRes = await request("POST", "/api/v1/products", {
    sku: "LOW-STOCK-001",
    name: "Low Stock Item",
    costPrice: 100,
    sellingPrice: 200,
    stock: 3,
    lowStockLimit: 10,
  }, ownerCookies);

  if (lowStockRes.status === 201) {
    const lowStockList = await request("GET", "/api/v1/products/low-stock", undefined, ownerCookies);

    assert(
      "Low stock endpoint returns 200",
      lowStockList.status === 200,
      `Status: ${lowStockList.status}`
    );

    const lowStockData = lowStockList.body?.data as Record<string, unknown>[] | undefined;
    if (lowStockData) {
      assert(
        "Low stock list includes item",
        lowStockData.length >= 1,
        `count: ${lowStockData.length}`
      );
    }

    // Cleanup low stock product
    const lowStockId = (lowStockRes.body?.data as Record<string, unknown>)?._id;
    if (lowStockId) {
      await request("PATCH", `/api/v1/products/${lowStockId}`, { stock: 0 }, ownerCookies);
      await request("DELETE", `/api/v1/products/${lowStockId}`, undefined, ownerCookies);
    }
  }

  // ────────────────────────────────────────────
  // TEST 12: Dead stock products
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Dead stock products ---");
  const deadStockRes = await request("GET", "/api/v1/products/dead-stock?days=90", undefined, ownerCookies);

  assert(
    "Dead stock endpoint returns 200",
    deadStockRes.status === 200,
    `Status: ${deadStockRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 13: Pagination
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Pagination ---");
  // Create multiple products for pagination
  for (let i = 0; i < 5; i++) {
    await request("POST", "/api/v1/products", {
      sku: `PAGE-TEST-${String(i).padStart(3, "0")}`,
      name: `Pagination Test ${i}`,
      costPrice: 100,
      sellingPrice: 200,
      stock: 10,
    }, ownerCookies);
  }

  const page1 = await request("GET", "/api/v1/products?page=1&limit=2", undefined, ownerCookies);
  assert(
    "Page 1 returns 200",
    page1.status === 200,
    `Status: ${page1.status}`
  );

  const page1Data = page1.body?.data as Record<string, unknown> | undefined;
  if (page1Data) {
    const pagination = page1Data.pagination as Record<string, unknown>;
    assert(
      "Pagination page = 1",
      pagination.page === 1,
      `page: ${pagination.page}`
    );
    assert(
      "Pagination limit = 2",
      pagination.limit === 2,
      `limit: ${pagination.limit}`
    );
      assert(
        "Pagination totalItems >= 5",
        (pagination.totalItems as number) >= 5,
        `totalItems: ${pagination.totalItems}`
      );
    assert(
      "Pagination totalPages >= 3",
      (pagination.totalPages as number) >= 3,
      `totalPages: ${pagination.totalPages}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 14: Filter by status
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Filter by status ---");
  // Create a draft product
  await request("POST", "/api/v1/products", {
    sku: "DRAFT-001",
    name: "Draft Product",
    costPrice: 50,
    sellingPrice: 100,
    stock: 5,
    status: "draft",
  }, ownerCookies);

  const draftFilter = await request("GET", "/api/v1/products?status=draft", undefined, ownerCookies);

  assert(
    "Status filter returns 200",
    draftFilter.status === 200,
    `Status: ${draftFilter.status}`
  );

  const draftData = draftFilter.body?.data as Record<string, unknown> | undefined;
  if (draftData) {
    const items = draftData.items as Record<string, unknown>[];
    const allDraft = items.every((p) => p.status === "draft");
    assert(
      "All filtered products have status=draft",
      allDraft,
      `statuses: ${items.map((p) => p.status).join(", ")}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 15: Invalid product ID
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Invalid product ID ---");
  const invalidIdRes = await request("GET", "/api/v1/products/invalid-id-123", undefined, ownerCookies);

  assert(
    "Invalid ID returns 400",
    invalidIdRes.status === 400,
    `Status: ${invalidIdRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 16: Non-existent product ID
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Non-existent product ID ---");
  const notFoundRes = await request(
    "GET",
    "/api/v1/products/000000000000000000000000",
    undefined,
    ownerCookies
  );

  assert(
    "Non-existent product returns 404",
    notFoundRes.status === 404,
    `Status: ${notFoundRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 17: Verify all activity logs for products
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Activity logs ---");
  const productLogs = await db.collection("activity_logs").find({ module: "products" }).toArray();
  const actions = productLogs.map((log) => log.action);

  assert(
    "CREATE_PRODUCT activity exists",
    actions.includes("CREATE_PRODUCT"),
    `actions: ${actions.join(", ")}`
  );
  assert(
    "UPDATE_PRODUCT activity exists",
    actions.includes("UPDATE_PRODUCT"),
    `actions: ${actions.join(", ")}`
  );
  assert(
    "DELETE_PRODUCT activity exists",
    actions.includes("DELETE_PRODUCT"),
    `actions: ${actions.join(", ")}`
  );

  // ────────────────────────────────────────────
  // TEST 18: Verify products collection
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Products collection ---");
  const productCount = await db.collection("products").countDocuments();
  assert(
    "Products collection has documents",
    productCount > 0,
    `count: ${productCount}`
  );

  // ────────────────────────────────────────────
  // Print all activity logs
  // ────────────────────────────────────────────
  console.log("\n--- Product Activity Logs ---");
  const allLogs = await db.collection("activity_logs").find({ module: "products" }).sort({ createdAt: 1 }).toArray();
  allLogs.forEach((log, i) => {
    console.log(`  ${i + 1}. action=${log.action} desc="${log.description}"`);
  });
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
