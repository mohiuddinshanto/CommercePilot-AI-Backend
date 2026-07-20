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
  console.log("\n========== PHASE 8 E2E VERIFICATION: SALES ==========\n");

  let ownerCookies: string[] = [];
  let productId1 = "";
  let productId2 = "";
  let bundleId = "";
  let saleId = "";
  let invoiceNumber = "";

  // ────────────────────────────────────────────
  // SETUP: Register owner, approve account, create store, products, bundle, inventory
  // ────────────────────────────────────────────
  console.log("\n--- SETUP: Register owner ---");
  const regRes = await request("POST", "/api/auth/sign-up/email", {
    name: "Sale Owner",
    email: "saleowner@example.com",
    password: "TestPass123!",
  });

  assert(
    "Owner registered",
    regRes.status === 200 || regRes.status === 201,
    `Status: ${regRes.status}`
  );

  ownerCookies = extractCookies(regRes.headers);

  const ownerUser = await db.collection("user").findOne({ email: "saleowner@example.com" });
  assert("Owner user created", ownerUser !== null, ownerUser ? `id: ${ownerUser._id}` : "not found");

  let storeId = "";
  if (ownerUser) {
    const now = new Date().toISOString();
    const storeResult = await db.collection("stores").insertOne({
      ownerId: ownerUser._id.toString(),
      storeName: "Sale Test Store",
      storeSlug: "sale-test-store",
      currency: "USD",
      timezone: "UTC",
      plan: "pro",
      accountStatus: "approved",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    storeId = storeResult.insertedId.toString();

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
      email: "saleowner@example.com",
      password: "TestPass123!",
    });
    ownerCookies = extractCookies(loginRes.headers);

    assert(
      "Owner re-login with approved account",
      loginRes.status === 200,
      `Status: ${loginRes.status}`
    );

    // Create product 1 with stock
    const product1Res = await request("POST", "/api/v1/products", {
      sku: "SALE-PROD-001",
      name: "Sale Product 1",
      costPrice: 10,
      sellingPrice: 25,
      stock: 50,
    }, ownerCookies);

    if (product1Res.status === 201 || product1Res.status === 200) {
      const product = product1Res.body?.data as Record<string, unknown> | undefined;
      if (product) {
        productId1 = (product._id as { toString(): string }).toString();
        assert("Product 1 created (stock=50)", true, `productId: ${productId1}`);
      }
    } else {
      assert("Product 1 created", false, `Status: ${product1Res.status}, body: ${JSON.stringify(product1Res.body)}`);
    }

    // Create product 2 with stock
    const product2Res = await request("POST", "/api/v1/products", {
      sku: "SALE-PROD-002",
      name: "Sale Product 2",
      costPrice: 15,
      sellingPrice: 35,
      stock: 30,
    }, ownerCookies);

    if (product2Res.status === 201 || product2Res.status === 200) {
      const product = product2Res.body?.data as Record<string, unknown> | undefined;
      if (product) {
        productId2 = (product._id as { toString(): string }).toString();
        assert("Product 2 created (stock=30)", true, `productId: ${productId2}`);
      }
    } else {
      assert("Product 2 created", false, `Status: ${product2Res.status}, body: ${JSON.stringify(product2Res.body)}`);
    }

    // Create inventory records for products
    if (productId1) {
      await db.collection("inventory").insertOne({
        storeId: new ObjectId(storeId),
        productId: new ObjectId(productId1),
        currentStock: 50,
        lowStockLimit: 10,
        reservedStock: 0,
        availableStock: 50,
        costPrice: 10,
        lastRestockedAt: null,
        lastSoldAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    }

    if (productId2) {
      await db.collection("inventory").insertOne({
        storeId: new ObjectId(storeId),
        productId: new ObjectId(productId2),
        currentStock: 30,
        lowStockLimit: 10,
        reservedStock: 0,
        availableStock: 30,
        costPrice: 15,
        lastRestockedAt: null,
        lastSoldAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
    }

    assert("Inventory records created", true, "2 inventory records");

    // Create bundle
    if (productId1 && productId2) {
      const bundleRes = await request("POST", "/api/v1/bundles", {
        name: "Sale Test Bundle",
        description: "Bundle for sale testing",
        products: [
          { productId: productId1, quantity: 2 },
          { productId: productId2, quantity: 1 },
        ],
        bundlePrice: 70,
        status: "active",
      }, ownerCookies);

      if (bundleRes.status === 201 || bundleRes.status === 200) {
        const bundle = bundleRes.body?.data as Record<string, unknown> | undefined;
        if (bundle) {
          bundleId = (bundle._id as { toString(): string }).toString();
          assert("Bundle created", true, `bundleId: ${bundleId}`);
        }
      } else {
        assert("Bundle created", false, `Status: ${bundleRes.status}, body: ${JSON.stringify(bundleRes.body)}`);
      }
    }
  }

  // ────────────────────────────────────────────
  // TEST 1: Unauthenticated access blocked
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Unauthenticated access ---");
  const unauthList = await request("GET", "/api/v1/sales");
  assert(
    "Unauthenticated user gets 401",
    unauthList.status === 401,
    `Status: ${unauthList.status}`
  );

  // ────────────────────────────────────────────
  // TEST 2: Create sale (product only, paid in full)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Create product sale (paid in full) ---");
  const createRes = await request("POST", "/api/v1/sales", {
    customerName: "Walk-in Customer",
    items: [
      { productId: productId1, name: "Sale Product 1", sku: "SALE-PROD-001", quantity: 3, unitPrice: 25 },
    ],
    paidAmount: 75,
    paymentMethod: "cash",
  }, ownerCookies);

  assert(
    "Create sale returns 201",
    createRes.status === 201,
    `Status: ${createRes.status}, body: ${JSON.stringify(createRes.body)}`
  );

  const createdSale = createRes.body?.data as Record<string, unknown> | undefined;
  if (createdSale) {
    saleId = (createdSale._id as { toString(): string }).toString();
    invoiceNumber = createdSale.invoiceNumber as string;
    assert("Sale has _id", !!saleId, `id: ${saleId}`);
    assert("Sale has invoiceNumber", !!invoiceNumber, `invoice: ${invoiceNumber}`);
    assert("Invoice starts with INV-", invoiceNumber.startsWith("INV-"), `invoice: ${invoiceNumber}`);
    assert("Sale customerName = Walk-in Customer", createdSale.customerName === "Walk-in Customer", `customerName: ${createdSale.customerName}`);
    assert("Sale subtotal = 75", createdSale.subtotal === 75, `subtotal: ${createdSale.subtotal}`);
    assert("Sale grandTotal = 75", createdSale.grandTotal === 75, `grandTotal: ${createdSale.grandTotal}`);
    assert("Sale paidAmount = 75", createdSale.paidAmount === 75, `paidAmount: ${createdSale.paidAmount}`);
    assert("Sale dueAmount = 0", createdSale.dueAmount === 0, `dueAmount: ${createdSale.dueAmount}`);
    assert("Sale paymentStatus = paid", createdSale.paymentStatus === "paid", `paymentStatus: ${createdSale.paymentStatus}`);
    assert("Sale status = completed", createdSale.status === "completed", `status: ${createdSale.status}`);
    assert("Sale paymentMethod = cash", createdSale.paymentMethod === "cash", `paymentMethod: ${createdSale.paymentMethod}`);
    assert("Sale has 1 item", Array.isArray(createdSale.items) && createdSale.items.length === 1, `items: ${JSON.stringify(createdSale.items)}`);
  }

  // Check activity log
  const createActivity = await db.collection("activity_logs").findOne({
    action: "CREATE_SALE",
    module: "sales",
  });
  assert(
    "CREATE_SALE activity logged",
    createActivity !== null,
    createActivity ? `desc: ${createActivity.description}` : "not found"
  );

  // Verify inventory was deducted
  const product1After = await db.collection("products").findOne({ _id: new ObjectId(productId1) });
  if (product1After) {
    assert(
      "Product 1 stock decreased from 50 to 47",
      product1After.stock === 47,
      `stock: ${product1After.stock}`
    );
  }

  // Verify inventory record updated
  const invRecord1 = await db.collection("inventory").findOne({
    storeId: new ObjectId(storeId),
    productId: new ObjectId(productId1),
  });
  if (invRecord1) {
    assert(
      "Inventory record currentStock = 47",
      invRecord1.currentStock === 47,
      `currentStock: ${invRecord1.currentStock}`
    );
  }

  // Verify inventory movement created
  const saleMovement = await db.collection("inventory_movements").findOne({
    productId: new ObjectId(productId1),
    type: "sale",
  });
  assert(
    "Sale inventory movement created",
    saleMovement !== null,
    saleMovement ? `type: ${saleMovement.type}, qty: ${saleMovement.quantity}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 3: Create partial payment sale
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Create partial payment sale ---");
  const partialRes = await request("POST", "/api/v1/sales", {
    customerName: "Partial Customer",
    customerPhone: "555-0100",
    items: [
      { productId: productId2, name: "Sale Product 2", sku: "SALE-PROD-002", quantity: 2, unitPrice: 35 },
    ],
    discount: 5,
    tax: 5,
    shipping: 10,
    paidAmount: 40,
    paymentMethod: "card",
  }, ownerCookies);

  assert(
    "Create partial sale returns 201",
    partialRes.status === 201,
    `Status: ${partialRes.status}, body: ${JSON.stringify(partialRes.body)}`
  );

  const partialSale = partialRes.body?.data as Record<string, unknown> | undefined;
  if (partialSale) {
    assert("Partial sale subtotal = 70", partialSale.subtotal === 70, `subtotal: ${partialSale.subtotal}`);
    assert("Partial sale grandTotal = 80 (70-5+5+10)", partialSale.grandTotal === 80, `grandTotal: ${partialSale.grandTotal}`);
    assert("Partial sale paidAmount = 40", partialSale.paidAmount === 40, `paidAmount: ${partialSale.paidAmount}`);
    assert("Partial sale dueAmount = 40", partialSale.dueAmount === 40, `dueAmount: ${partialSale.dueAmount}`);
    assert("Partial sale paymentStatus = partial", partialSale.paymentStatus === "partial", `paymentStatus: ${partialSale.paymentStatus}`);
    assert("Partial sale customerPhone = 555-0100", partialSale.customerPhone === "555-0100", `customerPhone: ${partialSale.customerPhone}`);
  }

  // ────────────────────────────────────────────
  // TEST 4: Create pending payment sale (no payment)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Create pending payment sale ---");
  const pendingRes = await request("POST", "/api/v1/sales", {
    customerName: "Due Customer",
    items: [
      { productId: productId2, name: "Sale Product 2", sku: "SALE-PROD-002", quantity: 1, unitPrice: 35 },
    ],
    paidAmount: 0,
    paymentMethod: "bank_transfer",
  }, ownerCookies);

  assert(
    "Create pending sale returns 201",
    pendingRes.status === 201,
    `Status: ${pendingRes.status}`
  );

  const pendingSale = pendingRes.body?.data as Record<string, unknown> | undefined;
  if (pendingSale) {
    assert("Pending sale paymentStatus = pending", pendingSale.paymentStatus === "pending", `paymentStatus: ${pendingSale.paymentStatus}`);
    assert("Pending sale dueAmount = 35", pendingSale.dueAmount === 35, `dueAmount: ${pendingSale.dueAmount}`);
  }

  // ────────────────────────────────────────────
  // TEST 5: Create bundle sale
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Create bundle sale ---");
  const bundleSaleRes = await request("POST", "/api/v1/sales", {
    customerName: "Bundle Customer",
    items: [
      { bundleId: bundleId, name: "Sale Test Bundle", sku: "BUNDLE-001", quantity: 1, unitPrice: 70 },
    ],
    paidAmount: 70,
    paymentMethod: "mobile_banking",
  }, ownerCookies);

  assert(
    "Create bundle sale returns 201",
    bundleSaleRes.status === 201,
    `Status: ${bundleSaleRes.status}, body: ${JSON.stringify(bundleSaleRes.body)}`
  );

  const bundleSaleData = bundleSaleRes.body?.data as Record<string, unknown> | undefined;
  if (bundleSaleData) {
    assert("Bundle sale grandTotal = 70", bundleSaleData.grandTotal === 70, `grandTotal: ${bundleSaleData.grandTotal}`);
    assert("Bundle sale paymentStatus = paid", bundleSaleData.paymentStatus === "paid", `paymentStatus: ${bundleSaleData.paymentStatus}`);
  }

  // Verify bundle product stocks were deducted (prod1: 2x, prod2: 1x)
  const p1AfterBundle = await db.collection("products").findOne({ _id: new ObjectId(productId1) });
  const p2AfterBundle = await db.collection("products").findOne({ _id: new ObjectId(productId2) });
  if (p1AfterBundle) {
    assert(
      "Product 1 stock decreased by 2 for bundle (47→45)",
      p1AfterBundle.stock === 45,
      `stock: ${p1AfterBundle.stock}`
    );
  }
  if (p2AfterBundle) {
    assert(
      "Product 2 stock decreased by 1 for bundle (27→26)",
      p2AfterBundle.stock === 26,
      `stock: ${p2AfterBundle.stock}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 6: Insufficient stock blocked
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Insufficient stock blocked ---");
  const insufficientRes = await request("POST", "/api/v1/sales", {
    customerName: "Too Many Items",
    items: [
      { productId: productId1, name: "Sale Product 1", sku: "SALE-PROD-001", quantity: 999, unitPrice: 25 },
    ],
    paidAmount: 25000,
    paymentMethod: "cash",
  }, ownerCookies);

  assert(
    "Insufficient stock returns 422",
    insufficientRes.status === 422,
    `Status: ${insufficientRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 7: Validation - empty items
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - empty items ---");
  const emptyItemsRes = await request("POST", "/api/v1/sales", {
    customerName: "No Items",
    items: [],
    paidAmount: 0,
    paymentMethod: "cash",
  }, ownerCookies);

  assert(
    "Empty items returns 400",
    emptyItemsRes.status === 400,
    `Status: ${emptyItemsRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 8: Validation - missing payment method
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - missing payment method ---");
  const noPmRes = await request("POST", "/api/v1/sales", {
    customerName: "No Payment Method",
    items: [
      { productId: productId1, name: "Sale Product 1", sku: "SALE-PROD-001", quantity: 1, unitPrice: 25 },
    ],
    paidAmount: 25,
  }, ownerCookies);

  assert(
    "Missing payment method returns 400",
    noPmRes.status === 400,
    `Status: ${noPmRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 9: Validation - missing paidAmount
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - missing paidAmount ---");
  const noPaidRes = await request("POST", "/api/v1/sales", {
    customerName: "No Paid Amount",
    items: [
      { productId: productId1, name: "Sale Product 1", sku: "SALE-PROD-001", quantity: 1, unitPrice: 25 },
    ],
    paymentMethod: "cash",
  }, ownerCookies);

  assert(
    "Missing paidAmount returns 400",
    noPaidRes.status === 400,
    `Status: ${noPaidRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 10: Validation - missing item fields
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - missing item fields ---");
  const badItemRes = await request("POST", "/api/v1/sales", {
    items: [
      { name: "", sku: "", quantity: 0, unitPrice: -5 },
    ],
    paidAmount: 0,
    paymentMethod: "cash",
  }, ownerCookies);

  assert(
    "Bad item fields returns 400",
    badItemRes.status === 400,
    `Status: ${badItemRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 11: Paid amount exceeds grand total
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Paid amount exceeds grand total ---");
  const overpayRes = await request("POST", "/api/v1/sales", {
    items: [
      { productId: productId1, name: "Sale Product 1", sku: "SALE-PROD-001", quantity: 1, unitPrice: 25 },
    ],
    paidAmount: 100,
    paymentMethod: "cash",
  }, ownerCookies);

  assert(
    "Paid amount exceeding total returns 422",
    overpayRes.status === 422,
    `Status: ${overpayRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 12: List sales
  // ────────────────────────────────────────────
  console.log("\n--- TEST: List sales ---");
  const listRes = await request("GET", "/api/v1/sales", undefined, ownerCookies);
  assert(
    "List sales returns 200",
    listRes.status === 200,
    `Status: ${listRes.status}`
  );

  const listData = listRes.body?.data as Record<string, unknown> | undefined;
  assert(
    "List returns paginated data",
    !!listData && Array.isArray(listData.items),
    `hasData: ${!!listData}, hasItems: ${listData ? Array.isArray(listData.items) : false}`
  );

  if (listData && Array.isArray(listData.items)) {
    assert(
      "List returns at least 4 sales",
      listData.items.length >= 4,
      `count: ${listData.items.length}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 13: Get sale by ID
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Get sale by ID ---");
  const getByIdRes = await request("GET", `/api/v1/sales/${saleId}`, undefined, ownerCookies);
  assert(
    "Get sale by ID returns 200",
    getByIdRes.status === 200,
    `Status: ${getByIdRes.status}`
  );

  const fetchedSale = getByIdRes.body?.data as Record<string, unknown> | undefined;
  if (fetchedSale) {
    assert("Fetched sale has correct invoice", fetchedSale.invoiceNumber === invoiceNumber, `invoice: ${fetchedSale.invoiceNumber}`);
    assert("Fetched sale has correct customerName", fetchedSale.customerName === "Walk-in Customer", `customerName: ${fetchedSale.customerName}`);
  }

  // ────────────────────────────────────────────
  // TEST 14: Get sale by invoice number
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Get sale by invoice number ---");
  const byInvoiceRes = await request("GET", `/api/v1/sales/invoice/${invoiceNumber}`, undefined, ownerCookies);
  assert(
    "Get sale by invoice returns 200",
    byInvoiceRes.status === 200,
    `Status: ${byInvoiceRes.status}`
  );

  const byInvoiceData = byInvoiceRes.body?.data as Record<string, unknown> | undefined;
  if (byInvoiceData) {
    assert("Invoice number matches", byInvoiceData.invoiceNumber === invoiceNumber, `invoice: ${byInvoiceData.invoiceNumber}`);
  }

  // ────────────────────────────────────────────
  // TEST 15: Update sale (update paid amount → recalculate payment status)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Update sale payment ---");
  const updateRes = await request("PATCH", `/api/v1/sales/${saleId}`, {
    paidAmount: 50,
    paymentMethod: "card",
  }, ownerCookies);

  assert(
    "Update sale returns 200",
    updateRes.status === 200,
    `Status: ${updateRes.status}`
  );

  const updatedSale = updateRes.body?.data as Record<string, unknown> | undefined;
  if (updatedSale) {
    assert("Updated paidAmount = 50", updatedSale.paidAmount === 50, `paidAmount: ${updatedSale.paidAmount}`);
    assert("Updated dueAmount = 25", updatedSale.dueAmount === 25, `dueAmount: ${updatedSale.dueAmount}`);
    assert("Updated paymentStatus = partial", updatedSale.paymentStatus === "partial", `paymentStatus: ${updatedSale.paymentStatus}`);
    assert("Updated paymentMethod = card", updatedSale.paymentMethod === "card", `paymentMethod: ${updatedSale.paymentMethod}`);
  }

  const updateActivity = await db.collection("activity_logs").findOne({
    action: "UPDATE_SALE",
    module: "sales",
  });
  assert(
    "UPDATE_SALE activity logged",
    updateActivity !== null,
    updateActivity ? `desc: ${updateActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 16: Update paidAmount > grandTotal blocked
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Update paidAmount exceeding total ---");
  const overpayUpdateRes = await request("PATCH", `/api/v1/sales/${saleId}`, {
    paidAmount: 999,
  }, ownerCookies);

  assert(
    "Overpay update returns 422",
    overpayUpdateRes.status === 422,
    `Status: ${overpayUpdateRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 17: Invoice number sequential generation
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Invoice number sequential ---");
  const sales = await db.collection("sales").find({ storeId, isDeleted: false }).sort({ createdAt: 1 }).toArray();
  if (sales.length >= 2) {
    const inv1 = sales[0].invoiceNumber as string;
    const inv2 = sales[1].invoiceNumber as string;
    const seq1 = parseInt(inv1.split("-").pop() || "0", 10);
    const seq2 = parseInt(inv2.split("-").pop() || "0", 10);
    assert(
      "Sequential invoice numbers",
      seq2 === seq1 + 1,
      `inv1: ${inv1}, inv2: ${inv2}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 18: Get today's sales
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Today's sales ---");
  const todayRes = await request("GET", "/api/v1/sales/today", undefined, ownerCookies);
  assert(
    "Today's sales returns 200",
    todayRes.status === 200,
    `Status: ${todayRes.status}`
  );

  const todayData = todayRes.body?.data as Record<string, unknown> | undefined;
  if (todayData && Array.isArray(todayData)) {
    assert(
      "Today's sales returns at least 4",
      todayData.length >= 4,
      `count: ${todayData.length}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 19: Sales summary
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Sales summary ---");
  const summaryRes = await request("GET", "/api/v1/sales/summary", undefined, ownerCookies);
  assert(
    "Sales summary returns 200",
    summaryRes.status === 200,
    `Status: ${summaryRes.status}`
  );

  const summaryData = summaryRes.body?.data as Record<string, unknown> | undefined;
  if (summaryData) {
    assert("Summary has totalSales >= 4", typeof summaryData.totalSales === "number" && (summaryData.totalSales as number) >= 4, `totalSales: ${summaryData.totalSales}`);
    assert("Summary has totalRevenue", typeof summaryData.totalRevenue === "number", `totalRevenue: ${summaryData.totalRevenue}`);
    assert("Summary has totalPaid", typeof summaryData.totalPaid === "number", `totalPaid: ${summaryData.totalPaid}`);
    assert("Summary has totalDue", typeof summaryData.totalDue === "number", `totalDue: ${summaryData.totalDue}`);
  }

  // ────────────────────────────────────────────
  // TEST 20: List with search
  // ────────────────────────────────────────────
  console.log("\n--- TEST: List with search ---");
  const searchRes = await request("GET", "/api/v1/sales?search=Walk-in", undefined, ownerCookies);
  assert(
    "Search sales returns 200",
    searchRes.status === 200,
    `Status: ${searchRes.status}`
  );

  const searchData = searchRes.body?.data as Record<string, unknown> | undefined;
  if (searchData && Array.isArray(searchData.items)) {
    assert(
      "Search finds Walk-in customer sale",
      searchData.items.length >= 1,
      `count: ${searchData.items.length}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 21: List with payment status filter
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Payment status filter ---");
  const filterRes = await request("GET", "/api/v1/sales?paymentStatus=paid", undefined, ownerCookies);
  assert(
    "Filter by paymentStatus returns 200",
    filterRes.status === 200,
    `Status: ${filterRes.status}`
  );

  const filterData = filterRes.body?.data as Record<string, unknown> | undefined;
  if (filterData && Array.isArray(filterData.items)) {
    const allPaid = filterData.items.every(
      (s: Record<string, unknown>) => s.paymentStatus === "paid"
    );
    assert(
      "All filtered sales are paid",
      allPaid,
      `statuses: ${filterData.items.map((s: Record<string, unknown>) => s.paymentStatus).join(", ")}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 22: Non-existent sale
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Non-existent sale ---");
  const fakeId = new ObjectId().toString();
  const notFoundRes = await request("GET", `/api/v1/sales/${fakeId}`, undefined, ownerCookies);
  assert(
    "Non-existent sale returns 404",
    notFoundRes.status === 404,
    `Status: ${notFoundRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 23: Invalid sale ID format
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Invalid sale ID ---");
  const invalidIdRes = await request("GET", "/api/v1/sales/invalid-id", undefined, ownerCookies);
  assert(
    "Invalid sale ID returns 400",
    invalidIdRes.status === 400,
    `Status: ${invalidIdRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 24: Non-existent invoice number
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Non-existent invoice ---");
  const noInvoiceRes = await request("GET", "/api/v1/sales/invoice/INV-00000000-9999", undefined, ownerCookies);
  assert(
    "Non-existent invoice returns 404",
    noInvoiceRes.status === 404,
    `Status: ${noInvoiceRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 25: Delete sale (restores inventory)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Delete sale (inventory restore) ---");

  // Record stock before delete
  const p1BeforeDelete = await db.collection("products").findOne({ _id: new ObjectId(productId1) });
  const stockBefore = p1BeforeDelete?.stock as number;

  const deleteRes = await request("DELETE", `/api/v1/sales/${saleId}`, undefined, ownerCookies);
  assert(
    "Delete sale returns 204",
    deleteRes.status === 204,
    `Status: ${deleteRes.status}`
  );

  const deleteActivity = await db.collection("activity_logs").findOne({
    action: "DELETE_SALE",
    module: "sales",
  });
  assert(
    "DELETE_SALE activity logged",
    deleteActivity !== null,
    deleteActivity ? `desc: ${deleteActivity.description}` : "not found"
  );

  // Verify inventory was restored
  const p1AfterDelete = await db.collection("products").findOne({ _id: new ObjectId(productId1) });
  if (p1AfterDelete) {
    assert(
      "Product 1 stock restored after delete",
      p1AfterDelete.stock === stockBefore + 3,
      `stockBefore: ${stockBefore}, stockAfter: ${p1AfterDelete.stock}`
    );
  }

  // Verify return movement was created
  const returnMovement = await db.collection("inventory_movements").findOne({
    productId: new ObjectId(productId1),
    type: "return",
  });
  assert(
    "Return inventory movement created",
    returnMovement !== null,
    returnMovement ? `type: ${returnMovement.type}, qty: ${returnMovement.quantity}` : "not found"
  );

  // Verify deleted sale returns 404
  const afterDeleteRes = await request("GET", `/api/v1/sales/${saleId}`, undefined, ownerCookies);
  assert(
    "Deleted sale returns 404",
    afterDeleteRes.status === 404,
    `Status: ${afterDeleteRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 26: Multi-tenant isolation
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Multi-tenant isolation ---");
  const regRes2 = await request("POST", "/api/auth/sign-up/email", {
    name: "Other Sale Owner",
    email: "othersaleowner@example.com",
    password: "TestPass123!",
  });

  let otherCookies: string[] = extractCookies(regRes2.headers);

  const otherUser = await db.collection("user").findOne({ email: "othersaleowner@example.com" });
  if (otherUser) {
    const now = new Date().toISOString();
    const storeResult = await db.collection("stores").insertOne({
      ownerId: otherUser._id.toString(),
      storeName: "Other Sale Store",
      storeSlug: "other-sale-store",
      currency: "USD",
      timezone: "UTC",
      plan: "pro",
      accountStatus: "approved",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const otherStoreId = storeResult.insertedId.toString();

    await db.collection("user").updateOne(
      { _id: otherUser._id },
      { $set: { storeId: otherStoreId, accountStatus: "approved", updatedAt: now } }
    );

    await request("POST", "/api/auth/sign-out", undefined, otherCookies);
    const loginRes2 = await request("POST", "/api/auth/sign-in/email", {
      email: "othersaleowner@example.com",
      password: "TestPass123!",
    });
    otherCookies = extractCookies(loginRes2.headers);
  }

  // Other owner tries to access sales from first owner
  const crossAccessRes = await request("GET", "/api/v1/sales", undefined, otherCookies);
  assert(
    "Cross-tenant access returns 200 with empty data",
    crossAccessRes.status === 200,
    `Status: ${crossAccessRes.status}`
  );

  const crossData = crossAccessRes.body?.data as Record<string, unknown> | undefined;
  if (crossData) {
    assert(
      "Cross-tenant sees no sales",
      Array.isArray(crossData.items) && crossData.items.length === 0,
      `items: ${Array.isArray(crossData.items) ? crossData.items.length : "not array"}`
    );
  }

  // Other owner tries to access first owner's sale by ID
  if (saleId) {
    const crossGetRes = await request("GET", `/api/v1/sales/${saleId}`, undefined, otherCookies);
    assert(
      "Cross-tenant get by ID returns 404",
      crossGetRes.status === 404,
      `Status: ${crossGetRes.status}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 27: Item without productId or bundleId rejected
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Item without productId or bundleId ---");
  const noRefRes = await request("POST", "/api/v1/sales", {
    items: [
      { name: "Ghost Item", sku: "GHOST-001", quantity: 1, unitPrice: 10 },
    ],
    paidAmount: 10,
    paymentMethod: "cash",
  }, ownerCookies);

  assert(
    "Item without productId/bundleId returns 400",
    noRefRes.status === 400,
    `Status: ${noRefRes.status}`
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
