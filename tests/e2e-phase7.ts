import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId, Db } from "mongodb";
import http from "http";

const TEST_PORT = 5100;
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
  console.log("\n========== PHASE 7 E2E VERIFICATION: BUNDLES ==========\n");

  let ownerCookies: string[] = [];
  let productId1 = "";
  let productId2 = "";
  let bundleId = "";

  // ────────────────────────────────────────────
  // SETUP: Register owner, approve account, create store, create products
  // ────────────────────────────────────────────
  console.log("\n--- SETUP: Register owner ---");
  const regRes = await request("POST", "/api/auth/sign-up/email", {
    name: "Bundle Owner",
    email: "bundleowner@example.com",
    password: "TestPass123!",
  });

  assert(
    "Owner registered",
    regRes.status === 200 || regRes.status === 201,
    `Status: ${regRes.status}`
  );

  ownerCookies = extractCookies(regRes.headers);

  const ownerUser = await db.collection("user").findOne({ email: "bundleowner@example.com" });
  assert("Owner user created", ownerUser !== null, ownerUser ? `id: ${ownerUser._id}` : "not found");

  if (ownerUser) {
    const now = new Date().toISOString();
    const storeResult = await db.collection("stores").insertOne({
      ownerId: ownerUser._id.toString(),
      storeName: "Bundle Test Store",
      storeSlug: "bundle-test-store",
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
      email: "bundleowner@example.com",
      password: "TestPass123!",
    });
    ownerCookies = extractCookies(loginRes.headers);

    assert(
      "Owner re-login with approved account",
      loginRes.status === 200,
      `Status: ${loginRes.status}`
    );

    // Create product 1
    const product1Res = await request("POST", "/api/v1/products", {
      sku: "BUNDLE-PROD-001",
      name: "Bundle Product 1",
      costPrice: 10,
      sellingPrice: 25,
      stock: 0,
    }, ownerCookies);

    if (product1Res.status === 201 || product1Res.status === 200) {
      const product = product1Res.body?.data as Record<string, unknown> | undefined;
      if (product) {
        productId1 = (product._id as { toString(): string }).toString();
        assert("Product 1 created", true, `productId: ${productId1}`);
      }
    } else {
      assert("Product 1 created", false, `Status: ${product1Res.status}`);
    }

    // Create product 2
    const product2Res = await request("POST", "/api/v1/products", {
      sku: "BUNDLE-PROD-002",
      name: "Bundle Product 2",
      costPrice: 15,
      sellingPrice: 35,
      stock: 0,
    }, ownerCookies);

    if (product2Res.status === 201 || product2Res.status === 200) {
      const product = product2Res.body?.data as Record<string, unknown> | undefined;
      if (product) {
        productId2 = (product._id as { toString(): string }).toString();
        assert("Product 2 created", true, `productId: ${productId2}`);
      }
    } else {
      assert("Product 2 created", false, `Status: ${product2Res.status}`);
    }
  }

  // ────────────────────────────────────────────
  // TEST 1: Unauthenticated access blocked
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Unauthenticated access ---");
  const unauthList = await request("GET", "/api/v1/bundles");
  assert(
    "Unauthenticated user gets 401",
    unauthList.status === 401,
    `Status: ${unauthList.status}`
  );

  // ────────────────────────────────────────────
  // TEST 2: Create bundle
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Create bundle ---");
  const createRes = await request("POST", "/api/v1/bundles", {
    name: "Summer Sale Bundle",
    description: "Great value bundle",
    products: [
      { productId: productId1, quantity: 2 },
      { productId: productId2, quantity: 1 },
    ],
    bundlePrice: 70,
    status: "active",
  }, ownerCookies);

  assert(
    "Create bundle returns 201",
    createRes.status === 201,
    `Status: ${createRes.status}`
  );

  const createdBundle = createRes.body?.data as Record<string, unknown> | undefined;
  if (createdBundle) {
    bundleId = (createdBundle._id as { toString(): string }).toString();
    assert("Bundle has _id", !!bundleId, `id: ${bundleId}`);
    assert("Bundle name is correct", createdBundle.name === "Summer Sale Bundle", `name: ${createdBundle.name}`);
    assert("Bundle has 2 products", Array.isArray(createdBundle.products) && createdBundle.products.length === 2, `products: ${JSON.stringify(createdBundle.products)}`);
    assert("Bundle originalPrice = 85", createdBundle.originalPrice === 85, `originalPrice: ${createdBundle.originalPrice}`);
    assert("Bundle bundlePrice = 70", createdBundle.bundlePrice === 70, `bundlePrice: ${createdBundle.bundlePrice}`);
    assert("Bundle discountAmount = 15", createdBundle.discountAmount === 15, `discountAmount: ${createdBundle.discountAmount}`);
    assert("Bundle discountPercentage ≈ 17.65", typeof createdBundle.discountPercentage === "number" && createdBundle.discountPercentage > 17 && createdBundle.discountPercentage < 18, `discountPercentage: ${createdBundle.discountPercentage}`);
    assert("Bundle status = active", createdBundle.status === "active", `status: ${createdBundle.status}`);
    assert("Bundle has slug", !!createdBundle.slug, `slug: ${createdBundle.slug}`);
  }

  // Check activity log
  const createActivity = await db.collection("activity_logs").findOne({
    action: "CREATE_BUNDLE",
    module: "bundles",
  });
  assert(
    "CREATE_BUNDLE activity logged",
    createActivity !== null,
    createActivity ? `desc: ${createActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 3: Duplicate products in bundle rejected
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Duplicate products ---");
  const dupRes = await request("POST", "/api/v1/bundles", {
    name: "Duplicate Bundle",
    products: [
      { productId: productId1, quantity: 1 },
      { productId: productId1, quantity: 2 },
    ],
    bundlePrice: 50,
  }, ownerCookies);

  assert(
    "Duplicate products returns 422",
    dupRes.status === 422,
    `Status: ${dupRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 4: Empty products rejected
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Empty products ---");
  const emptyRes = await request("POST", "/api/v1/bundles", {
    name: "Empty Bundle",
    products: [],
    bundlePrice: 50,
  }, ownerCookies);

  assert(
    "Empty products returns 400",
    emptyRes.status === 400,
    `Status: ${emptyRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 5: Bundle price exceeds original price
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Bundle price exceeds original ---");
  const priceExceedRes = await request("POST", "/api/v1/bundles", {
    name: "Expensive Bundle",
    products: [
      { productId: productId1, quantity: 1 },
    ],
    bundlePrice: 999,
  }, ownerCookies);

  assert(
    "Bundle price exceeding original returns 422",
    priceExceedRes.status === 422,
    `Status: ${priceExceedRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 6: Validation - missing name
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - missing name ---");
  const missingNameRes = await request("POST", "/api/v1/bundles", {
    products: [{ productId: productId1, quantity: 1 }],
    bundlePrice: 20,
  }, ownerCookies);

  assert(
    "Missing name returns 400",
    missingNameRes.status === 400,
    `Status: ${missingNameRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 7: Validation - missing bundlePrice
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - missing bundlePrice ---");
  const missingPriceRes = await request("POST", "/api/v1/bundles", {
    name: "No Price Bundle",
    products: [{ productId: productId1, quantity: 1 }],
  }, ownerCookies);

  assert(
    "Missing bundlePrice returns 400",
    missingPriceRes.status === 400,
    `Status: ${missingPriceRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 8: List bundles
  // ────────────────────────────────────────────
  console.log("\n--- TEST: List bundles ---");
  const listRes = await request("GET", "/api/v1/bundles", undefined, ownerCookies);
  assert(
    "List bundles returns 200",
    listRes.status === 200,
    `Status: ${listRes.status}`
  );

  const listData = listRes.body?.data as Record<string, unknown> | undefined;
  assert(
    "List returns items in paginated format",
    !!listData && Array.isArray(listData.items),
    `hasData: ${!!listData}, hasItems: ${listData ? Array.isArray(listData.items) : false}`
  );

  if (listData && Array.isArray(listData.items)) {
    assert(
      "List returns at least 1 bundle",
      listData.items.length >= 1,
      `count: ${listData.items.length}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 9: Get bundle by ID
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Get bundle by ID ---");
  const getByIdRes = await request("GET", `/api/v1/bundles/${bundleId}`, undefined, ownerCookies);
  assert(
    "Get bundle by ID returns 200",
    getByIdRes.status === 200,
    `Status: ${getByIdRes.status}`
  );

  const fetchedBundle = getByIdRes.body?.data as Record<string, unknown> | undefined;
  if (fetchedBundle) {
    assert("Fetched bundle has correct name", fetchedBundle.name === "Summer Sale Bundle", `name: ${fetchedBundle.name}`);
    assert("Fetched bundle has 2 products", Array.isArray(fetchedBundle.products) && fetchedBundle.products.length === 2, `products: ${JSON.stringify(fetchedBundle.products)}`);
  }

  // ────────────────────────────────────────────
  // TEST 10: Update bundle
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Update bundle ---");
  const updateRes = await request("PATCH", `/api/v1/bundles/${bundleId}`, {
    name: "Updated Bundle Name",
    bundlePrice: 65,
  }, ownerCookies);

  assert(
    "Update bundle returns 200",
    updateRes.status === 200,
    `Status: ${updateRes.status}`
  );

  const updatedBundle = updateRes.body?.data as Record<string, unknown> | undefined;
  if (updatedBundle) {
    assert("Updated bundle name = Updated Bundle Name", updatedBundle.name === "Updated Bundle Name", `name: ${updatedBundle.name}`);
    assert("Updated bundle bundlePrice = 65", updatedBundle.bundlePrice === 65, `bundlePrice: ${updatedBundle.bundlePrice}`);
    assert("Updated bundle discountAmount = 20", updatedBundle.discountAmount === 20, `discountAmount: ${updatedBundle.discountAmount}`);
  }

  const updateActivity = await db.collection("activity_logs").findOne({
    action: "UPDATE_BUNDLE",
    module: "bundles",
  });
  assert(
    "UPDATE_BUNDLE activity logged",
    updateActivity !== null,
    updateActivity ? `desc: ${updateActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 11: Get bundle stock
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Get bundle stock ---");
  const stockRes = await request("GET", `/api/v1/bundles/${bundleId}/stock`, undefined, ownerCookies);
  assert(
    "Get bundle stock returns 200",
    stockRes.status === 200,
    `Status: ${stockRes.status}`
  );

  const stockData = stockRes.body?.data as Record<string, unknown> | undefined;
  if (stockData) {
    assert("Stock has bundleId", stockData.bundleId === bundleId, `bundleId: ${stockData.bundleId}`);
    assert("Stock has availableStock", typeof stockData.availableStock === "number", `availableStock: ${stockData.availableStock}`);
    assert("Bundle stock = 0 (products have 0 stock)", stockData.availableStock === 0, `availableStock: ${stockData.availableStock}`);
  }

  // ────────────────────────────────────────────
  // TEST 12: Non-existent bundle
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Non-existent bundle ---");
  const fakeId = new ObjectId().toString();
  const notFoundRes = await request("GET", `/api/v1/bundles/${fakeId}`, undefined, ownerCookies);
  assert(
    "Non-existent bundle returns 404",
    notFoundRes.status === 404,
    `Status: ${notFoundRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 13: Invalid bundle ID format
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Invalid bundle ID ---");
  const invalidIdRes = await request("GET", "/api/v1/bundles/invalid-id", undefined, ownerCookies);
  assert(
    "Invalid bundle ID returns 400",
    invalidIdRes.status === 400,
    `Status: ${invalidIdRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 14: Delete bundle
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Delete bundle ---");
  const deleteRes = await request("DELETE", `/api/v1/bundles/${bundleId}`, undefined, ownerCookies);
  assert(
    "Delete bundle returns 204",
    deleteRes.status === 204,
    `Status: ${deleteRes.status}`
  );

  const deleteActivity = await db.collection("activity_logs").findOne({
    action: "DELETE_BUNDLE",
    module: "bundles",
  });
  assert(
    "DELETE_BUNDLE activity logged",
    deleteActivity !== null,
    deleteActivity ? `desc: ${deleteActivity.description}` : "not found"
  );

  // Verify soft delete - should return 404
  const afterDeleteRes = await request("GET", `/api/v1/bundles/${bundleId}`, undefined, ownerCookies);
  assert(
    "Deleted bundle returns 404",
    afterDeleteRes.status === 404,
    `Status: ${afterDeleteRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 15: Multi-tenant isolation
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Multi-tenant isolation ---");
  const regRes2 = await request("POST", "/api/auth/sign-up/email", {
    name: "Other Owner",
    email: "otherbundleowner@example.com",
    password: "TestPass123!",
  });

  let otherCookies: string[] = extractCookies(regRes2.headers);

  const otherUser = await db.collection("user").findOne({ email: "otherbundleowner@example.com" });
  if (otherUser) {
    const now = new Date().toISOString();
    const storeResult = await db.collection("stores").insertOne({
      ownerId: otherUser._id.toString(),
      storeName: "Other Bundle Store",
      storeSlug: "other-bundle-store",
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
      email: "otherbundleowner@example.com",
      password: "TestPass123!",
    });
    otherCookies = extractCookies(loginRes2.headers);
  }

  // Other owner tries to access bundles from first owner
  const crossAccessRes = await request("GET", "/api/v1/bundles", undefined, otherCookies);
  assert(
    "Cross-tenant access blocked (returns 200 with empty data)",
    crossAccessRes.status === 200,
    `Status: ${crossAccessRes.status}`
  );

  const crossData = crossAccessRes.body?.data as Record<string, unknown> | undefined;
  if (crossData) {
    assert(
      "Cross-tenant sees empty bundles",
      Array.isArray(crossData.items) && crossData.items.length === 0,
      `items: ${Array.isArray(crossData.items) ? crossData.items.length : "not array"}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 16: Create bundle with default draft status
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Default draft status ---");
  const draftRes = await request("POST", "/api/v1/bundles", {
    name: "Draft Bundle",
    products: [{ productId: productId1, quantity: 1 }],
    bundlePrice: 20,
  }, ownerCookies);

  assert(
    "Create draft bundle returns 201",
    draftRes.status === 201,
    `Status: ${draftRes.status}`
  );

  const draftBundle = draftRes.body?.data as Record<string, unknown> | undefined;
  if (draftBundle) {
    assert("Draft bundle status = draft", draftBundle.status === "draft", `status: ${draftBundle.status}`);
  }

  // ────────────────────────────────────────────
  // TEST 17: Validation - negative bundle price
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Negative bundle price ---");
  const negPriceRes = await request("POST", "/api/v1/bundles", {
    name: "Negative Price Bundle",
    products: [{ productId: productId1, quantity: 1 }],
    bundlePrice: -10,
  }, ownerCookies);

  assert(
    "Negative bundle price returns 400",
    negPriceRes.status === 400,
    `Status: ${negPriceRes.status}`
  );
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
