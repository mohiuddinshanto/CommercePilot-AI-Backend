import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId, Db } from "mongodb";
import http from "http";

process.env.BETTER_AUTH_SECRET = "test-secret-key-for-phase14";
process.env.BETTER_AUTH_URL = "http://localhost:5114";
process.env.CLIENT_URL = "http://localhost:3000";
process.env.NODE_ENV = "test";
process.env.PORT = "5114";

const TEST_PORT = 5114;
let db: Db;
let client: MongoClient;
let server: http.Server | undefined;
let mongoServer: MongoMemoryServer;

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
  console.log("\n========== PHASE 14 E2E VERIFICATION: SUPER ADMIN ==========\n");

  let superAdminCookies: string[] = [];
  let ownerCookies: string[] = [];
  let staffCookies: string[] = [];
  let storeId = "";

  try {
    console.log("Setting up test environment...");

    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    const dbName = "commercepilot_test";

    process.env.MONGODB_URI = uri;
    process.env.DB_NAME = dbName;

    const { connectDatabase, getDatabase } = await import("../src/config/database");
    await connectDatabase();
    db = getDatabase();

    const expressModule = await import("express");
    const express = expressModule.default;
    const corsModule = await import("cors");
    const cors = corsModule.default;
    const helmetModule = await import("helmet");
    const helmet = helmetModule.default;

    const app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true }));

    const { getAuth } = await import("../src/config/auth");
    const { toNodeHandler } = await import("better-auth/node");
    const auth = getAuth();
    app.use("/api/auth/*", toNodeHandler(auth));

    const { apiRoutes } = await import("../src/routes/index");
    app.use("/api/v1", apiRoutes);

    const { notFoundHandler, errorHandler } = await import("../src/middleware/error.middleware");
    app.use(notFoundHandler);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(TEST_PORT, resolve));
    console.log(`Server running on port ${TEST_PORT}\n`);

    console.log("Registering users via auth API...");

    // Register super admin
    await request("POST", "/api/auth/sign-up/email", {
      name: "Super Admin",
      email: "superadmin@test.com",
      password: "testpassword123",
    });

    // Register owner
    await request("POST", "/api/auth/sign-up/email", {
      name: "Store Owner",
      email: "owner-admin@test.com",
      password: "testpassword123",
    });

    // Register staff
    await request("POST", "/api/auth/sign-up/email", {
      name: "Staff User",
      email: "staff-admin@test.com",
      password: "testpassword123",
    });

    // Now update roles and create store using direct DB access
    const users = await db.collection("user").find({}).toArray();
    const superAdminUser = users.find((u: Record<string, unknown>) => u.email === "superadmin@test.com");
    const ownerUser = users.find((u: Record<string, unknown>) => u.email === "owner-admin@test.com");
    const staffUser = users.find((u: Record<string, unknown>) => u.email === "staff-admin@test.com");

    if (!superAdminUser || !ownerUser || !staffUser) {
      throw new Error("Failed to register test users");
    }

    storeId = new ObjectId().toString();

    await db.collection("stores").insertOne({
      _id: new ObjectId(storeId),
      ownerId: ownerUser._id.toString(),
      storeName: "Admin Test Store",
      storeSlug: "admin-test-store",
      accountStatus: "approved",
      plan: "starter",
      currency: "USD",
      timezone: "UTC",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Update roles
    await db.collection("user").updateOne(
      { _id: superAdminUser._id },
      { $set: { role: "super_admin", storeId, accountStatus: "approved", plan: "business" } }
    );
    await db.collection("user").updateOne(
      { _id: ownerUser._id },
      { $set: { role: "owner", storeId, accountStatus: "approved", plan: "starter" } }
    );
    await db.collection("user").updateOne(
      { _id: staffUser._id },
      { $set: { role: "staff", storeId, accountStatus: "approved", plan: "starter" } }
    );

    console.log("Logging in users...\n");

    // Login all users
    const superAdminLoginRes = await request("POST", "/api/auth/sign-in/email", {
      email: "superadmin@test.com",
      password: "testpassword123",
    });
    superAdminCookies = extractCookies(superAdminLoginRes.headers);
    console.log(`Super Admin login: status=${superAdminLoginRes.status}, cookies=${superAdminCookies.length}`);

    const ownerLoginRes = await request("POST", "/api/auth/sign-in/email", {
      email: "owner-admin@test.com",
      password: "testpassword123",
    });
    ownerCookies = extractCookies(ownerLoginRes.headers);
    console.log(`Owner login: status=${ownerLoginRes.status}, cookies=${ownerCookies.length}`);

    const staffLoginRes = await request("POST", "/api/auth/sign-in/email", {
      email: "staff-admin@test.com",
      password: "testpassword123",
    });
    staffCookies = extractCookies(staffLoginRes.headers);
    console.log(`Staff login: status=${staffLoginRes.status}, cookies=${staffCookies.length}\n`);

    // ─── TEST 1: Unauthenticated access returns 401 ───
    {
      const res = await request("GET", "/api/v1/admin/dashboard");
      assert(
        "GET /admin/dashboard without auth returns 401",
        res.status === 401,
        `status=${res.status}`
      );
    }

    // ─── TEST 2: Owner cannot access admin routes (403) ───
    {
      const res = await request("GET", "/api/v1/admin/dashboard", undefined, ownerCookies);
      assert(
        "Owner cannot access admin dashboard (403)",
        res.status === 403,
        `status=${res.status}`
      );
    }

    // ─── TEST 3: Staff cannot access admin routes (403) ───
    {
      const res = await request("GET", "/api/v1/admin/dashboard", undefined, staffCookies);
      assert(
        "Staff cannot access admin dashboard (403)",
        res.status === 403,
        `status=${res.status}`
      );
    }

    // ─── TEST 4: Super Admin can access dashboard ───
    {
      const res = await request("GET", "/api/v1/admin/dashboard", undefined, superAdminCookies);
      const data = res.body as Record<string, unknown>;
      const dash = data.data as Record<string, unknown> | undefined;
      assert(
        "Super Admin can access dashboard",
        res.status === 200 && !!dash?.totalStores,
        `status=${res.status}, totalStores=${dash?.totalStores}`
      );
    }

    // ─── TEST 5: GET /admin/stores returns store list ───
    {
      const res = await request("GET", "/api/v1/admin/stores?page=1&limit=10", undefined, superAdminCookies);
      const data = res.body as Record<string, unknown>;
      const body = data.data as Record<string, unknown> | undefined;
      const items = body?.items as unknown[] | undefined;
      assert(
        "GET /admin/stores returns store list",
        res.status === 200 && Array.isArray(items) && items.length >= 1,
        `status=${res.status}, count=${items?.length}`
      );
    }

    // ─── TEST 6: GET /admin/stores/:id returns store detail ───
    {
      const res = await request("GET", `/api/v1/admin/stores/${storeId}`, undefined, superAdminCookies);
      const data = res.body as Record<string, unknown>;
      const store = data.data as Record<string, unknown> | undefined;
      assert(
        "GET /admin/stores/:id returns store detail",
        res.status === 200 && store?.storeName === "Admin Test Store",
        `status=${res.status}, storeName=${store?.storeName}`
      );
    }

    // ─── TEST 7: PATCH /admin/stores/:id/status approves store ───
    {
      const res = await request("PATCH", `/api/v1/admin/stores/${storeId}/status`, { status: "approved" }, superAdminCookies);
      assert(
        "PATCH /admin/stores/:id/status approves store",
        res.status === 200,
        `status=${res.status}`
      );
    }

    // ─── TEST 8: PATCH /admin/stores/:id/status suspends store ───
    {
      const res = await request("PATCH", `/api/v1/admin/stores/${storeId}/status`, { status: "suspended" }, superAdminCookies);
      assert(
        "PATCH /admin/stores/:id/status suspends store",
        res.status === 200,
        `status=${res.status}`
      );
    }

    // ─── TEST 9: PATCH /admin/stores/:id/status with invalid status returns 400 ───
    {
      const res = await request("PATCH", `/api/v1/admin/stores/${storeId}/status`, { status: "invalid" }, superAdminCookies);
      assert(
        "PATCH /admin/stores/:id/status with invalid status returns 400",
        res.status === 400,
        `status=${res.status}`
      );
    }

    // ─── TEST 10: GET /admin/users returns user list ───
    {
      const res = await request("GET", "/api/v1/admin/users?page=1&limit=10", undefined, superAdminCookies);
      const data = res.body as Record<string, unknown>;
      const body = data.data as Record<string, unknown> | undefined;
      const items = body?.items as unknown[] | undefined;
      assert(
        "GET /admin/users returns user list",
        res.status === 200 && Array.isArray(items) && items.length >= 1,
        `status=${res.status}, count=${items?.length}`
      );
    }

    // ─── TEST 11: PATCH /admin/users/:id/status approves user ───
    {
      const res = await request("PATCH", `/api/v1/admin/users/${ownerUser._id.toString()}/status`, { status: "approved" }, superAdminCookies);
      assert(
        "PATCH /admin/users/:id/status approves user",
        res.status === 200,
        `status=${res.status}`
      );
    }

    // ─── TEST 12: PATCH /admin/users/:id/status suspends user ───
    {
      const res = await request("PATCH", `/api/v1/admin/users/${ownerUser._id.toString()}/status`, { status: "suspended" }, superAdminCookies);
      assert(
        "PATCH /admin/users/:id/status suspends user",
        res.status === 200,
        `status=${res.status}`
      );
    }

    // ─── TEST 13: GET /admin/subscriptions returns list ───
    {
      const res = await request("GET", "/api/v1/admin/subscriptions?page=1&limit=10", undefined, superAdminCookies);
      assert(
        "GET /admin/subscriptions returns subscription list",
        res.status === 200,
        `status=${res.status}`
      );
    }

    // ─── TEST 14: GET /admin/activity returns activity logs ───
    {
      const res = await request("GET", "/api/v1/admin/activity?page=1&limit=20", undefined, superAdminCookies);
      const data = res.body as Record<string, unknown>;
      const body = data.data as Record<string, unknown> | undefined;
      const items = body?.items as unknown[] | undefined;
      assert(
        "GET /admin/activity returns activity logs",
        res.status === 200 && Array.isArray(items),
        `status=${res.status}, count=${items?.length}`
      );
    }

    // ─── TEST 15: GET /admin/system returns system stats ───
    {
      const res = await request("GET", "/api/v1/admin/system", undefined, superAdminCookies);
      const data = res.body as Record<string, unknown>;
      const stats = data.data as Record<string, unknown> | undefined;
      assert(
        "GET /admin/system returns system stats",
        res.status === 200 && !!stats?.totalCollections,
        `status=${res.status}, totalCollections=${stats?.totalCollections}`
      );
    }

    // ─── TEST 16: Owner cannot access admin stores ───
    {
      const res = await request("GET", "/api/v1/admin/stores", undefined, ownerCookies);
      assert(
        "Owner cannot access admin stores (403)",
        res.status === 403,
        `status=${res.status}`
      );
    }

    // ─── TEST 17: Staff cannot access admin users ───
    {
      const res = await request("GET", "/api/v1/admin/users", undefined, staffCookies);
      assert(
        "Staff cannot access admin users (403)",
        res.status === 403,
        `status=${res.status}`
      );
    }

    // ─── TEST 18: Staff cannot access admin system ───
    {
      const res = await request("GET", "/api/v1/admin/system", undefined, staffCookies);
      assert(
        "Staff cannot access admin system (403)",
        res.status === 403,
        `status=${res.status}`
      );
    }

    // ─── TEST 19: Activity logs are created after status changes ───
    {
      await request("PATCH", `/api/v1/admin/stores/${storeId}/status`, { status: "approved" }, superAdminCookies);
      const res = await request("GET", "/api/v1/admin/activity?page=1&limit=5", undefined, superAdminCookies);
      const data = res.body as Record<string, unknown>;
      const body = data.data as Record<string, unknown> | undefined;
      const items = body?.items as Array<Record<string, unknown>> | undefined;
      const hasAdminAction = items?.some((i) => i.action === "STORE_APPROVED");
      assert(
        "Activity logs record admin actions",
        res.status === 200 && !!hasAdminAction,
        `status=${res.status}, hasAdminAction=${hasAdminAction}`
      );
    }

    // ─── TEST 20: GET /admin/stores with status filter ───
    {
      const res = await request("GET", "/api/v1/admin/stores?status=approved&page=1&limit=10", undefined, superAdminCookies);
      assert(
        "GET /admin/stores with status filter works",
        res.status === 200,
        `status=${res.status}`
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
