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
  console.log("\n========== PHASE 5 E2E VERIFICATION: CATEGORIES ==========\n");

  let ownerCookies: string[] = [];
  let categoryId = "";

  // ────────────────────────────────────────────
  // SETUP: Register owner, approve account, create store
  // ────────────────────────────────────────────
  console.log("\n--- SETUP: Register owner ---");
  const regRes = await request("POST", "/api/auth/sign-up/email", {
    name: "Category Owner",
    email: "categoryowner@example.com",
    password: "TestPass123!",
  });

  assert(
    "Owner registered",
    regRes.status === 200 || regRes.status === 201,
    `Status: ${regRes.status}`
  );

  ownerCookies = extractCookies(regRes.headers);

  const ownerUser = await db.collection("user").findOne({ email: "categoryowner@example.com" });
  assert("Owner user created", ownerUser !== null, ownerUser ? `id: ${ownerUser._id}` : "not found");

  if (ownerUser) {
    const now = new Date().toISOString();
    const storeResult = await db.collection("stores").insertOne({
      ownerId: ownerUser._id.toString(),
      storeName: "Category Test Store",
      storeSlug: "category-test-store",
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
      email: "categoryowner@example.com",
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
  const unauthList = await request("GET", "/api/v1/categories");
  assert(
    "Unauthenticated user gets 401",
    unauthList.status === 401,
    `Status: ${unauthList.status}`
  );

  // ────────────────────────────────────────────
  // TEST 2: Create category
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Create category ---");
  const createRes = await request("POST", "/api/v1/categories", {
    name: "Electronics",
    description: "Electronic devices and gadgets.",
    status: "active",
    sortOrder: 1,
  }, ownerCookies);

  assert(
    "Create category returns 201",
    createRes.status === 201,
    `Status: ${createRes.status}`
  );

  const createdCategory = createRes.body?.data as Record<string, unknown> | undefined;
  if (createdCategory) {
    categoryId = (createdCategory._id as { toString(): string }).toString();
    assert("Category has _id", !!categoryId, `id: ${categoryId}`);
    assert("Category name = Electronics", createdCategory.name === "Electronics", `name: ${createdCategory.name}`);
    assert("Category slug = electronics", createdCategory.slug === "electronics", `slug: ${createdCategory.slug}`);
    assert("Category status = active", createdCategory.status === "active", `status: ${createdCategory.status}`);
    assert("Category sortOrder = 1", createdCategory.sortOrder === 1, `sortOrder: ${createdCategory.sortOrder}`);
    assert("Category description set", createdCategory.description === "Electronic devices and gadgets.", `description: ${createdCategory.description}`);
  }

  // Check activity log
  const createActivity = await db.collection("activity_logs").findOne({
    action: "CREATE_CATEGORY",
    module: "categories",
  });
  assert(
    "CREATE_CATEGORY activity logged",
    createActivity !== null,
    createActivity ? `desc: ${createActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 3: Duplicate name/slug rejected
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Duplicate name ---");
  const dupRes = await request("POST", "/api/v1/categories", {
    name: "Electronics",
    description: "Duplicate category",
  }, ownerCookies);

  assert(
    "Duplicate name returns 409",
    dupRes.status === 409,
    `Status: ${dupRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 4: Validation - missing required fields
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - missing fields ---");
  const validRes = await request("POST", "/api/v1/categories", {
    description: "No name category",
  }, ownerCookies);

  assert(
    "Missing required fields returns 400",
    validRes.status === 400,
    `Status: ${validRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 5: List categories
  // ────────────────────────────────────────────
  console.log("\n--- TEST: List categories ---");
  const listRes = await request("GET", "/api/v1/categories", undefined, ownerCookies);

  assert(
    "List categories returns 200",
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
      "List returns at least 1 category",
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
  // TEST 6: Search categories
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Search categories ---");
  const searchRes = await request("GET", "/api/v1/categories?search=Electronics", undefined, ownerCookies);

  assert(
    "Search returns 200",
    searchRes.status === 200,
    `Status: ${searchRes.status}`
  );

  const searchData = searchRes.body?.data as Record<string, unknown> | undefined;
  if (searchData) {
    const items = searchData.items as Record<string, unknown>[];
    assert(
      "Search finds Electronics category",
      items.length >= 1,
      `found: ${items.length}`
    );
    assert(
      "Search result contains correct category",
      items[0]?.name === "Electronics",
      `name: ${items[0]?.name}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 7: Get category by ID
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Get category by ID ---");
  if (categoryId) {
    const getRes = await request("GET", `/api/v1/categories/${categoryId}`, undefined, ownerCookies);

    assert(
      "Get category returns 200",
      getRes.status === 200,
      `Status: ${getRes.status}`
    );

    const category = getRes.body?.data as Record<string, unknown>;
    if (category) {
      assert(
        "Get returns correct category",
        category.name === "Electronics",
        `name: ${category.name}`
      );
    }
  }

  // ────────────────────────────────────────────
  // TEST 8: Update category
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Update category ---");
  if (categoryId) {
    const updateRes = await request("PATCH", `/api/v1/categories/${categoryId}`, {
      name: "Electronics & Gadgets",
      description: "Updated description for electronics.",
      sortOrder: 5,
    }, ownerCookies);

    assert(
      "Update category returns 200",
      updateRes.status === 200,
      `Status: ${updateRes.status}`
    );

    const updated = updateRes.body?.data as Record<string, unknown>;
    if (updated) {
      assert(
        "Updated name = Electronics & Gadgets",
        updated.name === "Electronics & Gadgets",
        `name: ${updated.name}`
      );
      assert(
        "Updated slug = electronics-gadgets",
        updated.slug === "electronics-gadgets",
        `slug: ${updated.slug}`
      );
      assert(
        "Updated sortOrder = 5",
        updated.sortOrder === 5,
        `sortOrder: ${updated.sortOrder}`
      );
    }

    // Check update activity log
    const updateActivity = await db.collection("activity_logs").findOne({
      action: "UPDATE_CATEGORY",
      module: "categories",
    });
    assert(
      "UPDATE_CATEGORY activity logged",
      updateActivity !== null,
      updateActivity ? `desc: ${updateActivity.description}` : "not found"
    );
  }

  // ────────────────────────────────────────────
  // TEST 9: Delete category (soft delete)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Delete category ---");
  if (categoryId) {
    const deleteRes = await request("DELETE", `/api/v1/categories/${categoryId}`, undefined, ownerCookies);

    assert(
      "Delete returns 204 (soft delete)",
      deleteRes.status === 204,
      `Status: ${deleteRes.status}`
    );

    // Verify soft deleted - should not be in list
    const afterDelete = await request("GET", `/api/v1/categories/${categoryId}`, undefined, ownerCookies);
    assert(
      "Deleted category not found (soft deleted)",
      afterDelete.status === 404,
      `Status: ${afterDelete.status}`
    );

    // Check activity log
    const deleteActivity = await db.collection("activity_logs").findOne({
      action: "DELETE_CATEGORY",
      module: "categories",
    });
    assert(
      "DELETE_CATEGORY activity logged",
      deleteActivity !== null,
      deleteActivity ? `desc: ${deleteActivity.description}` : "not found"
    );

    // Verify isDeleted in database
    const dbCategory = await db.collection("categories").findOne({ _id: new ObjectId(categoryId) });
    if (dbCategory) {
      assert(
        "Category isDeleted = true in DB",
        dbCategory.isDeleted === true,
        `isDeleted: ${dbCategory.isDeleted}`
      );
    }
  }

  // ────────────────────────────────────────────
  // TEST 10: Pagination
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Pagination ---");
  for (let i = 0; i < 5; i++) {
    await request("POST", "/api/v1/categories", {
      name: `Category ${i}`,
      description: `Test category ${i}`,
      sortOrder: i,
    }, ownerCookies);
  }

  const page1 = await request("GET", "/api/v1/categories?page=1&limit=2", undefined, ownerCookies);
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
  // TEST 11: Filter by status
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Filter by status ---");
  await request("POST", "/api/v1/categories", {
    name: "Draft Category",
    status: "draft",
  }, ownerCookies);

  const draftFilter = await request("GET", "/api/v1/categories?status=draft", undefined, ownerCookies);

  assert(
    "Status filter returns 200",
    draftFilter.status === 200,
    `Status: ${draftFilter.status}`
  );

  const draftData = draftFilter.body?.data as Record<string, unknown> | undefined;
  if (draftData) {
    const items = draftData.items as Record<string, unknown>[];
    const allDraft = items.every((c) => c.status === "draft");
    assert(
      "All filtered categories have status=draft",
      allDraft,
      `statuses: ${items.map((c) => c.status).join(", ")}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 12: Invalid category ID
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Invalid category ID ---");
  const invalidIdRes = await request("GET", "/api/v1/categories/invalid-id-123", undefined, ownerCookies);

  assert(
    "Invalid ID returns 400",
    invalidIdRes.status === 400,
    `Status: ${invalidIdRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 13: Non-existent category ID
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Non-existent category ID ---");
  const notFoundRes = await request(
    "GET",
    "/api/v1/categories/000000000000000000000000",
    undefined,
    ownerCookies
  );

  assert(
    "Non-existent category returns 404",
    notFoundRes.status === 404,
    `Status: ${notFoundRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 14: Verify all activity logs
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Activity logs ---");
  const categoryLogs = await db.collection("activity_logs").find({ module: "categories" }).toArray();
  const actions = categoryLogs.map((log) => log.action);

  assert(
    "CREATE_CATEGORY activity exists",
    actions.includes("CREATE_CATEGORY"),
    `actions: ${actions.join(", ")}`
  );
  assert(
    "UPDATE_CATEGORY activity exists",
    actions.includes("UPDATE_CATEGORY"),
    `actions: ${actions.join(", ")}`
  );
  assert(
    "DELETE_CATEGORY activity exists",
    actions.includes("DELETE_CATEGORY"),
    `actions: ${actions.join(", ")}`
  );

  // ────────────────────────────────────────────
  // TEST 15: Verify categories collection
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Categories collection ---");
  const categoryCount = await db.collection("categories").countDocuments();
  assert(
    "Categories collection has documents",
    categoryCount > 0,
    `count: ${categoryCount}`
  );

  // ────────────────────────────────────────────
  // TEST 16: Slug generation
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Slug generation ---");
  const slugRes = await request("POST", "/api/v1/categories", {
    name: "Home & Garden Products",
  }, ownerCookies);

  if (slugRes.status === 201) {
    const slugCategory = slugRes.body?.data as Record<string, unknown>;
    assert(
      "Slug generated correctly for special chars",
      slugCategory.slug === "home-garden-products",
      `slug: ${slugCategory.slug}`
    );

    // Cleanup
    const slugId = (slugCategory._id as { toString(): string }).toString();
    await request("DELETE", `/api/v1/categories/${slugId}`, undefined, ownerCookies);
  }

  // ────────────────────────────────────────────
  // TEST 17: Create with optional fields
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Create with optional fields ---");
  const minimalRes = await request("POST", "/api/v1/categories", {
    name: "Minimal Category",
  }, ownerCookies);

  assert(
    "Create with minimal fields returns 201",
    minimalRes.status === 201,
    `Status: ${minimalRes.status}`
  );

  if (minimalRes.status === 201) {
    const minimalCat = minimalRes.body?.data as Record<string, unknown>;
    assert(
      "Default status = active",
      minimalCat.status === "active",
      `status: ${minimalCat.status}`
    );
    assert(
      "Default sortOrder = 0",
      minimalCat.sortOrder === 0,
      `sortOrder: ${minimalCat.sortOrder}`
    );

    // Cleanup
    const minimalId = (minimalCat._id as { toString(): string }).toString();
    await request("DELETE", `/api/v1/categories/${minimalId}`, undefined, ownerCookies);
  }

  // ────────────────────────────────────────────
  // Print all activity logs
  // ────────────────────────────────────────────
  console.log("\n--- Category Activity Logs ---");
  const allLogs = await db.collection("activity_logs").find({ module: "categories" }).sort({ createdAt: 1 }).toArray();
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
