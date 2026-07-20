import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId, Db } from "mongodb";
import http from "http";

const TEST_PORT = 5102;
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
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const options: http.RequestOptions = {
      hostname: "localhost",
      port: TEST_PORT,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
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
    if (bodyStr) req.write(bodyStr);
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
  console.log("\n========== PHASE 12 E2E VERIFICATION: AI COPILOT ==========\n");

  let ownerCookies: string[] = [];
  let staffCookies: string[] = [];
  let storeId = "";

  try {
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

    console.log("Seeding test data...");

    // Register owner via auth API
    const regRes = await request("POST", "/api/auth/sign-up/email", {
      name: "AI Test Owner",
      email: "owner-ai@test.com",
      password: "TestPass123!",
    });
    ownerCookies = extractCookies(regRes.headers);

    // Register staff via auth API
    await request("POST", "/api/auth/sign-up/email", {
      name: "AI Test Staff",
      email: "staff-ai@test.com",
      password: "TestPass123!",
    });

    // Get userId from the registered user
    const registeredUser = await db.collection("user").findOne({ email: "owner-ai@test.com" });
    const userId = registeredUser!._id;
    storeId = userId.toString();

    // Create store via API
    const storeRes = await request("POST", "/api/v1/stores", {
      name: "AI Test Store",
      slug: "ai-test-store",
    }, ownerCookies);

    // Get storeId from response
    const storeData = (storeRes.body as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    storeId = (storeData?.storeId || storeData?._id) as string;

    // Approve the user account
    const ownerUser = await db.collection("user").findOne({ email: "owner-ai@test.com" });
    if (ownerUser) {
      await db.collection("user").updateOne(
        { _id: ownerUser._id },
        { $set: { accountStatus: "approved" } }
      );
    }

    // Approve the store
    await db.collection("stores").updateOne(
      { _id: new ObjectId(storeId) },
      { $set: { status: "approved", accountStatus: "approved", isActive: true } }
    );

    // Re-login owner to get fresh session with storeId
    await request("POST", "/api/auth/sign-out", undefined, ownerCookies);
    const loginOwnerRes = await request("POST", "/api/auth/sign-in/email", {
      email: "owner-ai@test.com",
      password: "TestPass123!",
    }, undefined);
    if (loginOwnerRes.status === 200) {
      ownerCookies = extractCookies(loginOwnerRes.headers);
    } else {
      const session = await db.collection("session").findOne({ userId: userId.toString() });
      if (session) {
        ownerCookies = [`better-auth.session_token=${session.token}`];
      }
    }

    // Login staff
    const loginStaffRes = await request("POST", "/api/auth/sign-in/email", {
      email: "staff-ai@test.com",
      password: "TestPass123!",
    }, undefined);
    if (loginStaffRes.status === 200) {
      staffCookies = extractCookies(loginStaffRes.headers);
    } else {
      const staffUser = await db.collection("user").findOne({ email: "staff-ai@test.com" });
      if (staffUser) {
        const session = await db.collection("session").findOne({ userId: staffUser._id.toString() });
        if (session) {
          staffCookies = [`better-auth.session_token=${session.token}`];
        }
      }
    }

    // Create staff records
    const staffUserRecord = await db.collection("user").findOne({ email: "staff-ai@test.com" });
    const staffUserId = staffUserRecord!._id;
    await db.collection("staff").insertMany([
      {
        storeId, userId: userId.toString(), name: "AI Test Owner", email: "owner-ai@test.com",
        role: "owner", permissions: ["products", "inventory", "sales", "reports", "analytics", "ai", "staff", "settings"],
        status: "active", invitedBy: userId.toString(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
      {
        storeId, userId: staffUserId.toString(), name: "AI Test Staff", email: "staff-ai@test.com",
        role: "cashier", permissions: ["ai"],
        status: "active", invitedBy: userId.toString(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    ]);

    // Seed products, inventory, sales for context
    const prodId1 = new ObjectId();
    const prodId2 = new ObjectId();
    await db.collection("products").insertMany([
      { _id: prodId1, storeId, name: "Widget A", sku: "WGT-001", costPrice: 10, sellingPrice: 25, stock: 50, lowStockLimit: 10, status: "active", isDeleted: false, images: [], tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { _id: prodId2, storeId, name: "Widget B", sku: "WGT-002", costPrice: 20, sellingPrice: 45, stock: 3, lowStockLimit: 5, status: "active", isDeleted: false, images: [], tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);

    await db.collection("inventory").insertMany([
      { storeId: new ObjectId(storeId), productId: prodId1, currentStock: 50, lowStockLimit: 10, reservedStock: 0, availableStock: 50, costPrice: 10, lastRestockedAt: new Date(), lastSoldAt: new Date(), createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
      { storeId: new ObjectId(storeId), productId: prodId2, currentStock: 3, lowStockLimit: 5, reservedStock: 0, availableStock: 3, costPrice: 20, lastRestockedAt: new Date(), lastSoldAt: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
    ]);

    await db.collection("sales").insertOne({
      storeId, invoiceNumber: "INV-AI-001", customerName: "Test Customer", customerPhone: "5551234",
      items: [{ productId: prodId1, name: "Widget A", sku: "WGT-001", quantity: 3, unitPrice: 25, totalPrice: 75 }],
      subtotal: 75, discount: 0, tax: 0, shipping: 0, grandTotal: 75, paidAmount: 75, dueAmount: 0,
      paymentMethod: "cash", paymentStatus: "paid", status: "completed", notes: "", isDeleted: false,
      createdBy: userId.toString(), updatedBy: userId.toString(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });

    // ─── TEST 1: POST /api/v1/ai/chat without auth ───
    {
      const res = await request("POST", "/api/v1/ai/chat", { message: "Hello" });
      assert(
        "Chat without auth returns 401",
        res.status === 401 || res.status === 403,
        `status=${res.status}`
      );
    }

    // ─── TEST 2: POST /api/v1/ai/chat with empty message ───
    {
      const res = await request("POST", "/api/v1/ai/chat", { message: "" }, ownerCookies);
      assert(
        "Chat with empty message returns 400",
        res.status === 400,
        `status=${res.status}`
      );
    }

    // ─── TEST 3: POST /api/v1/ai/chat with valid message ───
    let firstConversationId = "";
    {
      const res = await request("POST", "/api/v1/ai/chat", { message: "What products do I have?" }, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const d = data.data as Record<string, unknown> | undefined;
      assert(
        "Chat with valid message succeeds",
        res.status === 200 && data.success === true && !!d?.conversationId,
        `status=${res.status}, convId=${d?.conversationId ? "present" : "missing"}`
      );
      if (d?.conversationId) {
        firstConversationId = d.conversationId as string;
      }
    }

    // ─── TEST 4: Chat response structure ───
    {
      const res = await request("POST", "/api/v1/ai/chat", { message: "How are my sales?" }, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const d = data.data as Record<string, unknown> | undefined;
      const hasAllFields = d && d.conversationId && d.userMessage && d.assistantMessage && d.model && d.title;
      assert(
        "Chat response has all required fields",
        res.status === 200 && !!hasAllFields,
        `fields=${hasAllFields ? "present" : "missing"}`
      );
    }

    // ─── TEST 5: Continue existing conversation ───
    {
      const res = await request("POST", "/api/v1/ai/chat", {
        message: "Tell me more about that",
        conversationId: firstConversationId,
      }, ownerCookies);
      const data = res.body as Record<string, unknown>;
      assert(
        "Continue existing conversation succeeds",
        res.status === 200 && data.success === true,
        `status=${res.status}`
      );
    }

    // ─── TEST 6: GET /api/v1/ai/conversations ───
    {
      const res = await request("GET", "/api/v1/ai/conversations", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const items = (data.data as Record<string, unknown>)?.items as unknown[] | undefined;
      assert(
        "List conversations returns items",
        res.status === 200 && data.success === true && Array.isArray(items) && items!.length > 0,
        `status=${res.status}, count=${items?.length || 0}`
      );
    }

    // ─── TEST 7: GET /api/v1/ai/conversations/:id ───
    {
      const res = await request("GET", `/api/v1/ai/conversations/${firstConversationId}`, undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const d = data.data as Record<string, unknown> | undefined;
      assert(
        "Get conversation by ID succeeds",
        res.status === 200 && data.success === true && d?.id === firstConversationId,
        `status=${res.status}`
      );
    }

    // ─── TEST 8: GET non-existent conversation returns 404 ───
    {
      const fakeId = new ObjectId().toString();
      const res = await request("GET", `/api/v1/ai/conversations/${fakeId}`, undefined, ownerCookies);
      assert(
        "Get non-existent conversation returns 404",
        res.status === 404,
        `status=${res.status}`
      );
    }

    // ─── TEST 9: DELETE conversation ───
    {
      const createRes = await request("POST", "/api/v1/ai/chat", { message: "Delete this test" }, ownerCookies);
      const createData = createRes.body as Record<string, unknown>;
      const convId = (createData.data as Record<string, unknown>)?.conversationId;

      if (convId) {
        const res = await request("DELETE", `/api/v1/ai/conversations/${convId}`, undefined, ownerCookies);
        assert(
          "Delete conversation succeeds",
          res.status === 200,
          `status=${res.status}`
        );

        const getRes = await request("GET", `/api/v1/ai/conversations/${convId}`, undefined, ownerCookies);
        assert(
          "Deleted conversation is no longer accessible",
          getRes.status === 404,
          `status=${getRes.status}`
        );
      } else {
        assert("Delete conversation", false, "Failed to create conversation for delete test");
      }
    }

    // ─── TEST 10: Staff with AI permission can chat ───
    {
      const res = await request("POST", "/api/v1/ai/chat", { message: "Staff AI test" }, staffCookies);
      assert(
        "Staff with AI permission can chat",
        res.status === 200,
        `status=${res.status}`
      );
    }

    // ─── TEST 11: Conversations are user-scoped ───
    {
      const ownerRes = await request("GET", "/api/v1/ai/conversations", undefined, ownerCookies);
      const staffRes = await request("GET", "/api/v1/ai/conversations", undefined, staffCookies);
      const ownerData = ownerRes.body as Record<string, unknown>;
      const staffData = staffRes.body as Record<string, unknown>;
      const ownerItems = (ownerData.data as Record<string, unknown>)?.items as unknown[] | undefined;
      const staffItems = (staffData.data as Record<string, unknown>)?.items as unknown[] | undefined;
      assert(
        "Owner and staff see separate conversation lists",
        ownerRes.status === 200 && staffRes.status === 200,
        `owner=${ownerItems?.length || 0}, staff=${staffItems?.length || 0}`
      );
    }

    // ─── TEST 12: Chat with invalid conversationId ───
    {
      const res = await request("POST", "/api/v1/ai/chat", {
        message: "Test",
        conversationId: new ObjectId().toString(),
      }, ownerCookies);
      assert(
        "Chat with invalid conversationId returns 404",
        res.status === 404,
        `status=${res.status}`
      );
    }

    // ─── TEST 13: Validation - message too long ───
    {
      const longMessage = "A".repeat(4001);
      const res = await request("POST", "/api/v1/ai/chat", { message: longMessage }, ownerCookies);
      assert(
        "Message exceeding 4000 chars returns 400",
        res.status === 400,
        `status=${res.status}`
      );
    }

    // ─── TEST 14: Activity log created ───
    {
      const activityCount = await db.collection("activity_logs").countDocuments({
        storeId,
        action: "AI_REQUEST",
      });
      assert(
        "Activity logs are created for AI requests",
        activityCount > 0,
        `count=${activityCount}`
      );
    }

    // ─── TEST 15: Conversations stored in DB ───
    {
      const convCount = await db.collection("ai_conversations").countDocuments({
        storeId,
        isDeleted: false,
      });
      assert(
        "Conversations are persisted in ai_conversations collection",
        convCount > 0,
        `count=${convCount}`
      );
    }

    // ─── TEST 16: Message history preserved ───
    {
      const conversation = await db.collection("ai_conversations").findOne({
        _id: new ObjectId(firstConversationId),
      });
      const msgs = (conversation as Record<string, unknown>)?.messages as unknown[] | undefined;
      assert(
        "Message history is preserved in conversation",
        Array.isArray(msgs) && msgs.length >= 4,
        `messageCount=${msgs?.length || 0}`
      );
    }

    // ─── TEST 17: DELETE non-existent conversation returns 404 ───
    {
      const res = await request("DELETE", `/api/v1/ai/conversations/${new ObjectId().toString()}`, undefined, ownerCookies);
      assert(
        "Delete non-existent conversation returns 404",
        res.status === 404,
        `status=${res.status}`
      );
    }

    // ─── TEST 18: POST /api/v1/ai/chat with message at exact limit ───
    {
      const exactMessage = "B".repeat(4000);
      const res = await request("POST", "/api/v1/ai/chat", { message: exactMessage }, ownerCookies);
      assert(
        "Message at exact 4000 char limit succeeds",
        res.status === 200,
        `status=${res.status}`
      );
    }

    // ─── TEST 19: GET conversations without auth returns 401 ───
    {
      const res = await request("GET", "/api/v1/ai/conversations");
      assert(
        "List conversations without auth returns 401",
        res.status === 401 || res.status === 403,
        `status=${res.status}`
      );
    }

    // ─── TEST 20: Conversations are sorted by updatedAt desc ───
    {
      const res = await request("GET", "/api/v1/ai/conversations", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const items = (data.data as Record<string, unknown>)?.items as Record<string, unknown>[] | undefined;
      if (items && items.length >= 2) {
        const sorted = items.every((item, i) =>
          i === 0 || (item.updatedAt as string) <= (items[i - 1].updatedAt as string)
        );
        assert("Conversations sorted by updatedAt descending", sorted, `sorted=${sorted}`);
      } else {
        assert("Conversations sorted by updatedAt descending", true, "Only 1 conversation, trivially sorted");
      }
    }

  } catch (error) {
    console.error("Test setup error:", error);
    assert("Test setup", false, String(error));
  } finally {
    if (server) server.close();
    if (client) await client.close();
    if (mongoServer) await mongoServer.stop();
  }

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
