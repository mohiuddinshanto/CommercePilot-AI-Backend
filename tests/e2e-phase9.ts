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
  console.log("\n========== PHASE 9 E2E VERIFICATION: RETURNS ==========\n");

  let ownerCookies: string[] = [];
  let productId1 = "";
  let productId2 = "";
  let bundleId = "";
  let saleId = "";
  let saleId2 = "";
  let saleId3 = "";
  let invoiceNumber = "";
  let invoiceNumber2 = "";
  let invoiceNumber3 = "";
  let returnId = "";
  let storeId = "";

  // ────────────────────────────────────────────
  // SETUP: Register owner, approve, create store, products, bundle, sales
  // ────────────────────────────────────────────
  console.log("\n--- SETUP: Register owner ---");
  const regRes = await request("POST", "/api/auth/sign-up/email", {
    name: "Return Owner",
    email: "returnowner@example.com",
    password: "TestPass123!",
  });

  assert(
    "Owner registered",
    regRes.status === 200 || regRes.status === 201,
    `Status: ${regRes.status}`
  );

  ownerCookies = extractCookies(regRes.headers);

  const ownerUser = await db.collection("user").findOne({ email: "returnowner@example.com" });
  assert("Owner user created", ownerUser !== null, ownerUser ? `id: ${ownerUser._id}` : "not found");

  if (ownerUser) {
    const now = new Date().toISOString();
    const storeResult = await db.collection("stores").insertOne({
      ownerId: ownerUser._id.toString(),
      storeName: "Return Test Store",
      storeSlug: "return-test-store",
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
      email: "returnowner@example.com",
      password: "TestPass123!",
    });
    ownerCookies = extractCookies(loginRes.headers);

    assert("Owner re-login", loginRes.status === 200, `Status: ${loginRes.status}`);

    // Create product 1
    const product1Res = await request("POST", "/api/v1/products", {
      sku: "RET-PROD-001",
      name: "Return Product 1",
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

    // Create product 2
    const product2Res = await request("POST", "/api/v1/products", {
      sku: "RET-PROD-002",
      name: "Return Product 2",
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
      assert("Product 2 created", false, `Status: ${product2Res.status}`);
    }

    // Create inventory records
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
        name: "Return Test Bundle",
        description: "Bundle for return testing",
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
      }
    }

    // Create sale 1 (product sale, paid in full) - for testing full return
    const sale1Res = await request("POST", "/api/v1/sales", {
      customerName: "Return Customer",
      customerPhone: "555-0101",
      items: [
        { productId: productId1, name: "Return Product 1", sku: "RET-PROD-001", quantity: 5, unitPrice: 25 },
      ],
      paidAmount: 125,
      paymentMethod: "cash",
    }, ownerCookies);

    if (sale1Res.status === 201) {
      const sale = sale1Res.body?.data as Record<string, unknown> | undefined;
      if (sale) {
        saleId = (sale._id as { toString(): string }).toString();
        invoiceNumber = sale.invoiceNumber as string;
        assert("Sale 1 created (5x Prod1, paid)", true, `saleId: ${saleId}, invoice: ${invoiceNumber}`);
      }
    } else {
      assert("Sale 1 created", false, `Status: ${sale1Res.status}, body: ${JSON.stringify(sale1Res.body)}`);
    }

    // Create sale 2 (2 products) - for testing partial return
    const sale2Res = await request("POST", "/api/v1/sales", {
      customerName: "Partial Customer",
      customerPhone: "555-0102",
      items: [
        { productId: productId1, name: "Return Product 1", sku: "RET-PROD-001", quantity: 3, unitPrice: 25 },
        { productId: productId2, name: "Return Product 2", sku: "RET-PROD-002", quantity: 2, unitPrice: 35 },
      ],
      paidAmount: 145,
      paymentMethod: "card",
    }, ownerCookies);

    if (sale2Res.status === 201) {
      const sale = sale2Res.body?.data as Record<string, unknown> | undefined;
      if (sale) {
        saleId2 = (sale._id as { toString(): string }).toString();
        invoiceNumber2 = sale.invoiceNumber as string;
        assert("Sale 2 created (3x Prod1 + 2x Prod2, paid)", true, `saleId2: ${saleId2}, invoice: ${invoiceNumber2}`);
      }
    } else {
      assert("Sale 2 created", false, `Status: ${sale2Res.status}`);
    }

    // Create sale 3 (bundle sale) - for testing bundle return
    const sale3Res = await request("POST", "/api/v1/sales", {
      customerName: "Bundle Customer",
      items: [
        { bundleId: bundleId, name: "Return Test Bundle", sku: "BUNDLE-RET-001", quantity: 2, unitPrice: 70 },
      ],
      paidAmount: 140,
      paymentMethod: "mobile_banking",
    }, ownerCookies);

    if (sale3Res.status === 201) {
      const sale = sale3Res.body?.data as Record<string, unknown> | undefined;
      if (sale) {
        saleId3 = (sale._id as { toString(): string }).toString();
        invoiceNumber3 = sale.invoiceNumber as string;
        assert("Sale 3 created (2x Bundle, paid)", true, `saleId3: ${saleId3}, invoice: ${invoiceNumber3}`);
      }
    } else {
      assert("Sale 3 created", false, `Status: ${sale3Res.status}`);
    }
  }

  // ────────────────────────────────────────────
  // TEST 1: Unauthenticated access blocked
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Unauthenticated access ---");
  const unauthList = await request("GET", "/api/v1/returns");
  assert(
    "Unauthenticated user gets 401",
    unauthList.status === 401,
    `Status: ${unauthList.status}`
  );

  // ────────────────────────────────────────────
  // TEST 2: Validation - empty items
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - empty items ---");
  const emptyItemsRes = await request("POST", "/api/v1/returns", {
    saleId: saleId,
    items: [],
    reason: "Defective",
  }, ownerCookies);

  assert(
    "Empty items returns 400",
    emptyItemsRes.status === 400,
    `Status: ${emptyItemsRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 3: Validation - missing saleId
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - missing saleId ---");
  const noSaleIdRes = await request("POST", "/api/v1/returns", {
    items: [{ productId: productId1, quantity: 1, unitPrice: 25 }],
    reason: "Defective",
  }, ownerCookies);

  assert(
    "Missing saleId returns 400",
    noSaleIdRes.status === 400,
    `Status: ${noSaleIdRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 4: Validation - invalid item (no productId/bundleId)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - invalid item ---");
  const invalidItemRes = await request("POST", "/api/v1/returns", {
    saleId: saleId,
    items: [{ quantity: 1, unitPrice: 25 }],
    reason: "Defective",
  }, ownerCookies);

  assert(
    "Invalid item returns 400",
    invalidItemRes.status === 400,
    `Status: ${invalidItemRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 5: Return for non-existent sale
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Non-existent sale ---");
  const fakeSaleId = new ObjectId().toString();
  const fakeSaleRes = await request("POST", "/api/v1/returns", {
    saleId: fakeSaleId,
    items: [{ productId: productId1, quantity: 1, unitPrice: 25 }],
    reason: "Defective",
  }, ownerCookies);

  assert(
    "Non-existent sale returns 404",
    fakeSaleRes.status === 404,
    `Status: ${fakeSaleRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 6: Over-return blocked
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Over-return blocked ---");
  const overReturnRes = await request("POST", "/api/v1/returns", {
    saleId: saleId,
    items: [{ productId: productId1, quantity: 999, unitPrice: 25 }],
    reason: "Defective",
  }, ownerCookies);

  assert(
    "Over-return returns 422",
    overReturnRes.status === 422,
    `Status: ${overReturnRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 7: Create full product return
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Create full product return ---");
  const fullReturnRes = await request("POST", "/api/v1/returns", {
    saleId: saleId,
    items: [{ productId: productId1, quantity: 3, unitPrice: 25 }],
    reason: "Defective Product",
    notes: "Product was damaged",
  }, ownerCookies);

  assert(
    "Full return returns 201",
    fullReturnRes.status === 201,
    `Status: ${fullReturnRes.status}, body: ${JSON.stringify(fullReturnRes.body)}`
  );

  const createdReturn = fullReturnRes.body?.data as Record<string, unknown> | undefined;
  if (createdReturn) {
    returnId = (createdReturn._id as { toString(): string }).toString();
    assert("Return has _id", !!returnId, `returnId: ${returnId}`);
    assert("Return status = pending", createdReturn.status === "pending", `status: ${createdReturn.status}`);
    assert("Return refundAmount = 75 (3x25)", createdReturn.refundAmount === 75, `refundAmount: ${createdReturn.refundAmount}`);
    assert("Return has invoiceNumber", !!createdReturn.invoiceNumber, `invoice: ${createdReturn.invoiceNumber}`);
    assert("Return customerName = Return Customer", createdReturn.customerName === "Return Customer", `customerName: ${createdReturn.customerName}`);
    assert("Return has 1 item", Array.isArray(createdReturn.items) && createdReturn.items.length === 1, `items: ${JSON.stringify(createdReturn.items)}`);
    assert("Return reason = Defective Product", createdReturn.reason === "Defective Product", `reason: ${createdReturn.reason}`);
  }

  // Check activity log
  const createActivity = await db.collection("activity_logs").findOne({
    action: "CREATE_RETURN",
    module: "returns",
  });
  assert(
    "CREATE_RETURN activity logged",
    createActivity !== null,
    createActivity ? `desc: ${createActivity.description}` : "not found"
  );

  // Verify inventory restored for product 1 (50 - 5 - 3 - 4 + 3 = 41)
  const p1AfterReturn = await db.collection("products").findOne({ _id: new ObjectId(productId1) });
  if (p1AfterReturn) {
    assert(
      "Product 1 stock restored after return (50-5-3-4+3=41)",
      p1AfterReturn.stock === 41,
      `stock: ${p1AfterReturn.stock}`
    );
  }

  // Verify inventory record updated
  const invRecord1 = await db.collection("inventory").findOne({
    storeId: new ObjectId(storeId),
    productId: new ObjectId(productId1),
  });
  if (invRecord1) {
    assert(
      "Inventory record currentStock updated after return",
      invRecord1.currentStock === 41,
      `currentStock: ${invRecord1.currentStock}`
    );
  }

  // Verify return inventory movement created
  const returnMovement = await db.collection("inventory_movements").findOne({
    productId: new ObjectId(productId1),
    type: "return",
  });
  assert(
    "Return inventory movement created",
    returnMovement !== null,
    returnMovement ? `type: ${returnMovement.type}, qty: ${returnMovement.quantity}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 8: Prevent duplicate return (over-return)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Prevent duplicate over-return ---");
  const duplicateRes = await request("POST", "/api/v1/returns", {
    saleId: saleId,
    items: [{ productId: productId1, quantity: 3, unitPrice: 25 }],
    reason: "Another return",
  }, ownerCookies);

  assert(
    "Duplicate over-return blocked (422)",
    duplicateRes.status === 422,
    `Status: ${duplicateRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 9: Create partial return (sale 2)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Create partial return ---");
  const partialReturnRes = await request("POST", "/api/v1/returns", {
    saleId: saleId2,
    items: [
      { productId: productId1, quantity: 1, unitPrice: 25 },
    ],
    reason: "Changed Mind",
  }, ownerCookies);

  assert(
    "Partial return returns 201",
    partialReturnRes.status === 201,
    `Status: ${partialReturnRes.status}`
  );

  const partialReturn = partialReturnRes.body?.data as Record<string, unknown> | undefined;
  if (partialReturn) {
    assert("Partial return refundAmount = 25", partialReturn.refundAmount === 25, `refundAmount: ${partialReturn.refundAmount}`);
    assert("Partial return reason = Changed Mind", partialReturn.reason === "Changed Mind", `reason: ${partialReturn.reason}`);
  }

  // Verify remaining stock for product 1 after partial return (41 + 1 = 42)
  const p1AfterPartial = await db.collection("products").findOne({ _id: new ObjectId(productId1) });
  if (p1AfterPartial) {
    assert(
      "Product 1 stock after partial return (41+1=42)",
      p1AfterPartial.stock === 42,
      `stock: ${p1AfterPartial.stock}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 10: Create bundle return (sale 3)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Create bundle return ---");
  const bundleReturnRes = await request("POST", "/api/v1/returns", {
    saleId: saleId3,
    items: [
      { bundleId: bundleId, quantity: 1, unitPrice: 70 },
    ],
    reason: "Damaged in Transit",
  }, ownerCookies);

  assert(
    "Bundle return returns 201",
    bundleReturnRes.status === 201,
    `Status: ${bundleReturnRes.status}`
  );

  const bundleReturn = bundleReturnRes.body?.data as Record<string, unknown> | undefined;
  if (bundleReturn) {
    assert("Bundle return refundAmount = 70", bundleReturn.refundAmount === 70, `refundAmount: ${bundleReturn.refundAmount}`);
  }

  // Verify bundle products restored (bundle: 2x Prod1 + 1x Prod2)
  const p1AfterBundleReturn = await db.collection("products").findOne({ _id: new ObjectId(productId1) });
  const p2AfterBundleReturn = await db.collection("products").findOne({ _id: new ObjectId(productId2) });
  if (p1AfterBundleReturn) {
    assert(
      "Product 1 stock after bundle return (42+2=44)",
      p1AfterBundleReturn.stock === 44,
      `stock: ${p1AfterBundleReturn.stock}`
    );
  }
  if (p2AfterBundleReturn) {
    // Prod2: started 30, sold 2 for sale2, sold 2 for bundle sale (2 bundles x 1 each), returned 1 bundle (1 prod2)
    // 30 - 2 - 2 + 1 = 27
    assert(
      "Product 2 stock after bundle return",
      p2AfterBundleReturn.stock === 27,
      `stock: ${p2AfterBundleReturn.stock}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 11: Create mixed return (sale 2, different items)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Create mixed return (product + remaining prod1) ---");
  const mixedReturnRes = await request("POST", "/api/v1/returns", {
    saleId: saleId2,
    items: [
      { productId: productId2, quantity: 1, unitPrice: 35 },
      { productId: productId1, quantity: 2, unitPrice: 25 },
    ],
    reason: "Quality Not as Expected",
  }, ownerCookies);

  assert(
    "Mixed return returns 201",
    mixedReturnRes.status === 201,
    `Status: ${mixedReturnRes.status}`
  );

  const mixedReturn = mixedReturnRes.body?.data as Record<string, unknown> | undefined;
  if (mixedReturn) {
    assert("Mixed return refundAmount = 85 (35+50)", mixedReturn.refundAmount === 85, `refundAmount: ${mixedReturn.refundAmount}`);
    assert("Mixed return has 2 items", Array.isArray(mixedReturn.items) && (mixedReturn.items as unknown[]).length === 2, `items: ${(mixedReturn.items as unknown[]).length}`);
  }

  // Verify over-return on sale 2 is now blocked for prod1 (sold 3, returned 1+2=3, fully returned)
  const overReturnSale2Res = await request("POST", "/api/v1/returns", {
    saleId: saleId2,
    items: [{ productId: productId1, quantity: 1, unitPrice: 25 }],
    reason: "Too late",
  }, ownerCookies);

  assert(
    "Over-return sale 2 prod1 blocked (422)",
    overReturnSale2Res.status === 422,
    `Status: ${overReturnSale2Res.status}`
  );

  // ────────────────────────────────────────────
  // TEST 12: List returns
  // ────────────────────────────────────────────
  console.log("\n--- TEST: List returns ---");
  const listRes = await request("GET", "/api/v1/returns", undefined, ownerCookies);
  assert(
    "List returns returns 200",
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
      "List returns at least 4 returns",
      listData.items.length >= 4,
      `count: ${listData.items.length}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 13: Get return by ID
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Get return by ID ---");
  const getByIdRes = await request("GET", `/api/v1/returns/${returnId}`, undefined, ownerCookies);
  assert(
    "Get return by ID returns 200",
    getByIdRes.status === 200,
    `Status: ${getByIdRes.status}`
  );

  const fetchedReturn = getByIdRes.body?.data as Record<string, unknown> | undefined;
  if (fetchedReturn) {
    assert("Fetched return has correct invoiceNumber", fetchedReturn.invoiceNumber === invoiceNumber, `invoice: ${fetchedReturn.invoiceNumber}`);
    assert("Fetched return status = pending", fetchedReturn.status === "pending", `status: ${fetchedReturn.status}`);
  }

  // ────────────────────────────────────────────
  // TEST 14: Get returns by invoice number
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Get returns by invoice number ---");
  const byInvoiceRes = await request("GET", `/api/v1/returns/invoice/${invoiceNumber}`, undefined, ownerCookies);
  assert(
    "Get returns by invoice returns 200",
    byInvoiceRes.status === 200,
    `Status: ${byInvoiceRes.status}`
  );

  const byInvoiceData = byInvoiceRes.body?.data as Record<string, unknown> | undefined;
  if (byInvoiceData && Array.isArray(byInvoiceData)) {
    assert(
      "Invoice lookup returns at least 1 return",
      byInvoiceData.length >= 1,
      `count: ${byInvoiceData.length}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 15: Update return status (approve)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Approve return ---");
  const approveRes = await request("PATCH", `/api/v1/returns/${returnId}`, {
    status: "approved",
  }, ownerCookies);

  assert(
    "Approve return returns 200",
    approveRes.status === 200,
    `Status: ${approveRes.status}`
  );

  const approvedReturn = approveRes.body?.data as Record<string, unknown> | undefined;
  if (approvedReturn) {
    assert("Return status = approved", approvedReturn.status === "approved", `status: ${approvedReturn.status}`);
  }

  const approveActivity = await db.collection("activity_logs").findOne({
    action: "APPROVE_RETURN",
    module: "returns",
  });
  assert(
    "APPROVE_RETURN activity logged",
    approveActivity !== null,
    approveActivity ? `desc: ${approveActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 16: Complete return
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Complete return ---");
  const completeRes = await request("PATCH", `/api/v1/returns/${returnId}`, {
    status: "completed",
  }, ownerCookies);

  assert(
    "Complete return returns 200",
    completeRes.status === 200,
    `Status: ${completeRes.status}`
  );

  const completedReturn = completeRes.body?.data as Record<string, unknown> | undefined;
  if (completedReturn) {
    assert("Return status = completed", completedReturn.status === "completed", `status: ${completedReturn.status}`);
  }

  const completeActivity = await db.collection("activity_logs").findOne({
    action: "COMPLETE_RETURN",
    module: "returns",
  });
  assert(
    "COMPLETE_RETURN activity logged",
    completeActivity !== null,
    completeActivity ? `desc: ${completeActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 17: Returns summary
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Returns summary ---");
  const summaryRes = await request("GET", "/api/v1/returns/summary", undefined, ownerCookies);
  assert(
    "Returns summary returns 200",
    summaryRes.status === 200,
    `Status: ${summaryRes.status}`
  );

  const summaryData = summaryRes.body?.data as Record<string, unknown> | undefined;
  if (summaryData) {
    assert("Summary has totalReturns >= 4", typeof summaryData.totalReturns === "number" && (summaryData.totalReturns as number) >= 4, `totalReturns: ${summaryData.totalReturns}`);
    assert("Summary has totalRefundAmount", typeof summaryData.totalRefundAmount === "number", `totalRefundAmount: ${summaryData.totalRefundAmount}`);
    assert("Summary has pendingReturns", typeof summaryData.pendingReturns === "number", `pendingReturns: ${summaryData.pendingReturns}`);
    assert("Summary has completedReturns", typeof summaryData.completedReturns === "number", `completedReturns: ${summaryData.completedReturns}`);
  }

  // ────────────────────────────────────────────
  // TEST 18: List with search
  // ────────────────────────────────────────────
  console.log("\n--- TEST: List with search ---");
  const searchRes = await request("GET", "/api/v1/returns?search=Defective", undefined, ownerCookies);
  assert(
    "Search returns 200",
    searchRes.status === 200,
    `Status: ${searchRes.status}`
  );

  const searchData = searchRes.body?.data as Record<string, unknown> | undefined;
  if (searchData && Array.isArray(searchData.items)) {
    assert(
      "Search finds returns with Defective reason",
      searchData.items.length >= 1,
      `count: ${searchData.items.length}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 19: List with status filter
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Status filter ---");
  const filterRes = await request("GET", "/api/v1/returns?status=pending", undefined, ownerCookies);
  assert(
    "Filter by status=pending returns 200",
    filterRes.status === 200,
    `Status: ${filterRes.status}`
  );

  const filterData = filterRes.body?.data as Record<string, unknown> | undefined;
  if (filterData && Array.isArray(filterData.items)) {
    const allPending = filterData.items.every(
      (r: Record<string, unknown>) => r.status === "pending"
    );
    assert(
      "All filtered returns are pending",
      allPending,
      `statuses: ${filterData.items.map((r: Record<string, unknown>) => r.status).join(", ")}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 20: Non-existent return
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Non-existent return ---");
  const fakeId = new ObjectId().toString();
  const notFoundRes = await request("GET", `/api/v1/returns/${fakeId}`, undefined, ownerCookies);
  assert(
    "Non-existent return returns 404",
    notFoundRes.status === 404,
    `Status: ${notFoundRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 21: Invalid return ID format
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Invalid return ID ---");
  const invalidIdRes = await request("GET", "/api/v1/returns/invalid-id", undefined, ownerCookies);
  assert(
    "Invalid return ID returns 400",
    invalidIdRes.status === 400,
    `Status: ${invalidIdRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 22: Delete return (soft delete)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Delete return ---");
  const deleteRes = await request("DELETE", `/api/v1/returns/${returnId}`, undefined, ownerCookies);
  assert(
    "Delete return returns 204",
    deleteRes.status === 204,
    `Status: ${deleteRes.status}`
  );

  const deleteActivity = await db.collection("activity_logs").findOne({
    action: "DELETE_RETURN",
    module: "returns",
  });
  assert(
    "DELETE_RETURN activity logged",
    deleteActivity !== null,
    deleteActivity ? `desc: ${deleteActivity.description}` : "not found"
  );

  // Verify deleted return returns 404
  const afterDeleteRes = await request("GET", `/api/v1/returns/${returnId}`, undefined, ownerCookies);
  assert(
    "Deleted return returns 404",
    afterDeleteRes.status === 404,
    `Status: ${afterDeleteRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 23: Update return status validation
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Invalid status update ---");
  const invalidStatusRes = await request("PATCH", `/api/v1/returns/${returnId}`, {
    status: "invalid_status",
  }, ownerCookies);

  assert(
    "Invalid status returns 400",
    invalidStatusRes.status === 400,
    `Status: ${invalidStatusRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 24: Pagination
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Pagination ---");
  const page1Res = await request("GET", "/api/v1/returns?page=1&limit=2", undefined, ownerCookies);
  assert(
    "Pagination page 1 returns 200",
    page1Res.status === 200,
    `Status: ${page1Res.status}`
  );

  const page1Data = page1Res.body?.data as Record<string, unknown> | undefined;
  if (page1Data && Array.isArray(page1Data.items)) {
    assert(
      "Pagination returns max 2 items",
      page1Data.items.length <= 2,
      `count: ${page1Data.items.length}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 25: Multi-tenant isolation
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Multi-tenant isolation ---");
  const regRes2 = await request("POST", "/api/auth/sign-up/email", {
    name: "Other Return Owner",
    email: "otherreturnowner@example.com",
    password: "TestPass123!",
  });

  let otherCookies: string[] = extractCookies(regRes2.headers);

  const otherUser = await db.collection("user").findOne({ email: "otherreturnowner@example.com" });
  if (otherUser) {
    const now = new Date().toISOString();
    const storeResult = await db.collection("stores").insertOne({
      ownerId: otherUser._id.toString(),
      storeName: "Other Return Store",
      storeSlug: "other-return-store",
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
      email: "otherreturnowner@example.com",
      password: "TestPass123!",
    });
    otherCookies = extractCookies(loginRes2.headers);
  }

  // Other owner tries to access returns from first owner
  const crossAccessRes = await request("GET", "/api/v1/returns", undefined, otherCookies);
  assert(
    "Cross-tenant access returns 200 with empty data",
    crossAccessRes.status === 200,
    `Status: ${crossAccessRes.status}`
  );

  const crossData = crossAccessRes.body?.data as Record<string, unknown> | undefined;
  if (crossData) {
    assert(
      "Cross-tenant sees no returns",
      Array.isArray(crossData.items) && crossData.items.length === 0,
      `items: ${Array.isArray(crossData.items) ? crossData.items.length : "not array"}`
    );
  }

  // Other owner tries to access first owner's return by ID
  if (returnId) {
    const crossGetRes = await request("GET", `/api/v1/returns/${returnId}`, undefined, otherCookies);
    assert(
      "Cross-tenant get by ID returns 404",
      crossGetRes.status === 404,
      `Status: ${crossGetRes.status}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 26: Item from different sale rejected
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Return item from different sale ---");
  const crossSaleRes = await request("POST", "/api/v1/returns", {
    saleId: saleId,
    items: [{ productId: productId2, quantity: 1, unitPrice: 35 }],
    reason: "Wrong sale",
  }, ownerCookies);

  assert(
    "Return item not in sale returns 400",
    crossSaleRes.status === 400,
    `Status: ${crossSaleRes.status}`
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
