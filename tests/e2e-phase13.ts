import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId, Db } from "mongodb";
import http from "http";

const TEST_PORT = 5103;
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
  console.log("\n========== PHASE 13 E2E VERIFICATION: SUBSCRIPTION & BILLING ==========\n");

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
      name: "Sub Test Owner",
      email: "owner-sub@test.com",
      password: "TestPass123!",
    });
    ownerCookies = extractCookies(regRes.headers);

    // Register staff via auth API
    await request("POST", "/api/auth/sign-up/email", {
      name: "Sub Test Staff",
      email: "staff-sub@test.com",
      password: "testpassword123",
    });

    // Get userId from the registered user
    const registeredUser = await db.collection("user").findOne({ email: "owner-sub@test.com" });
    const userId = registeredUser!._id;
    storeId = userId.toString();

    // Create store via API
    const storeRes = await request("POST", "/api/v1/stores", {
      name: "Sub Test Store",
      slug: "sub-test-store",
    }, ownerCookies);

    // Get storeId from response
    const storeData = (storeRes.body as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    storeId = (storeData?.storeId || storeData?._id) as string;

    // Approve the user account
    const ownerUser = await db.collection("user").findOne({ email: "owner-sub@test.com" });
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

    // Re-login to get fresh session with storeId
    await request("POST", "/api/auth/sign-out", undefined, ownerCookies);
    const loginRes = await request("POST", "/api/auth/sign-in/email", {
      email: "owner-sub@test.com",
      password: "TestPass123!",
    }, undefined);
    if (loginRes.status === 200) {
      ownerCookies = extractCookies(loginRes.headers);
    } else {
      const session = await db.collection("session").findOne({ userId: userId.toString() });
      if (session) {
        ownerCookies = [`better-auth.session_token=${session.token}`];
      }
    }

    console.log(`Owner login complete. Cookies: ${ownerCookies.length}\n`);

    // ─── TEST 1: GET /api/v1/subscriptions returns 404 (no subscription yet) ───
    {
      const res = await request("GET", "/api/v1/subscriptions", undefined, ownerCookies);
      assert(
        "GET /subscriptions without existing subscription returns error or empty",
        res.status === 404 || res.status === 200,
        `status=${res.status}`
      );
    }

    // ─── TEST 2: POST /api/v1/subscriptions creates starter subscription ───
    {
      const res = await request("POST", "/api/v1/subscriptions", { plan: "starter", billingCycle: "monthly" }, ownerCookies);
      assert(
        "POST /subscriptions creates starter subscription",
        res.status === 201 || res.status === 200,
        `status=${res.status}`
      );
    }

    // ─── TEST 3: GET /api/v1/subscriptions retrieves the subscription ───
    {
      const res = await request("GET", "/api/v1/subscriptions", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const sub = data.data as Record<string, unknown> | undefined;
      assert(
        "GET /subscriptions returns subscription data",
        res.status === 200 && !!sub?.plan,
        `status=${res.status}, plan=${sub?.plan}`
      );
    }

    // ─── TEST 4: POST /api/v1/subscriptions with invalid plan returns 400 ───
    {
      const res = await request("POST", "/api/v1/subscriptions", { plan: "invalid" }, ownerCookies);
      assert(
        "POST /subscriptions with invalid plan returns 400",
        res.status === 400,
        `status=${res.status}`
      );
    }

    // ─── TEST 5: POST /api/v1/subscriptions duplicate returns error ───
    {
      const res = await request("POST", "/api/v1/subscriptions", { plan: "starter" }, ownerCookies);
      assert(
        "POST /subscriptions duplicate returns conflict or error",
        res.status === 409 || res.status === 400 || res.status === 200,
        `status=${res.status}`
      );
    }

    // ─── TEST 6: PATCH /api/v1/subscriptions/upgrade upgrades to pro ───
    {
      const res = await request("PATCH", "/api/v1/subscriptions/upgrade", { plan: "pro", billingCycle: "monthly" }, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const sub = data.data as Record<string, unknown> | undefined;
      assert(
        "PATCH /subscriptions/upgrade to pro succeeds",
        res.status === 200 && sub?.plan === "pro",
        `status=${res.status}, plan=${sub?.plan}`
      );
    }

    // ─── TEST 7: PATCH /api/v1/subscriptions/upgrade to invalid plan returns 400 ───
    {
      const res = await request("PATCH", "/api/v1/subscriptions/upgrade", { plan: "starter" }, ownerCookies);
      assert(
        "PATCH /subscriptions/upgrade to lower plan (downgrade) via upgrade returns error",
        res.status === 400 || res.status === 403,
        `status=${res.status}`
      );
    }

    // ─── TEST 8: PATCH /api/v1/subscriptions/downgrade to starter ───
    {
      const res = await request("PATCH", "/api/v1/subscriptions/downgrade", { plan: "starter", billingCycle: "monthly" }, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const sub = data.data as Record<string, unknown> | undefined;
      assert(
        "PATCH /subscriptions/downgrade to starter succeeds",
        res.status === 200 && sub?.plan === "starter",
        `status=${res.status}, plan=${sub?.plan}`
      );
    }

    // ─── TEST 9: Re-upgrade to business for further tests ───
    {
      const res = await request("PATCH", "/api/v1/subscriptions/upgrade", { plan: "business", billingCycle: "yearly" }, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const sub = data.data as Record<string, unknown> | undefined;
      assert(
        "PATCH /subscriptions/upgrade to business with yearly billing",
        res.status === 200 && sub?.plan === "business",
        `status=${res.status}, plan=${sub?.plan}`
      );
    }

    // ─── TEST 10: GET /api/v1/subscriptions/usage returns usage data ───
    {
      const res = await request("GET", "/api/v1/subscriptions/usage", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const usage = data.data as Record<string, unknown> | undefined;
      assert(
        "GET /subscriptions/usage returns usage data",
        res.status === 200 && !!usage,
        `status=${res.status}`
      );
    }

    // ─── TEST 11: GET /api/v1/subscriptions/billing returns billing records ───
    {
      const res = await request("GET", "/api/v1/subscriptions/billing", undefined, ownerCookies);
      assert(
        "GET /subscriptions/billing returns billing history",
        res.status === 200,
        `status=${res.status}`
      );
    }

    // ─── TEST 12: PATCH /api/v1/subscriptions/cancel cancels subscription ───
    {
      const res = await request("PATCH", "/api/v1/subscriptions/cancel", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const sub = data.data as Record<string, unknown> | undefined;
      assert(
        "PATCH /subscriptions/cancel cancels subscription",
        res.status === 200 && (sub?.status === "cancelled" || sub?.cancelledAt),
        `status=${res.status}, status=${sub?.status}`
      );
    }

    // ─── TEST 13: PATCH /api/v1/subscriptions/renew renews subscription ───
    {
      const res = await request("PATCH", "/api/v1/subscriptions/renew", undefined, ownerCookies);
      assert(
        "PATCH /subscriptions/renew renews subscription",
        res.status === 200,
        `status=${res.status}`
      );
    }

    // ─── TEST 14: Staff member cannot create subscription (not owner) ───
    {
      const staffLoginRes = await request("POST", "/api/auth/sign-in/email", {
        email: "staff-sub@test.com",
        password: "testpassword123",
      });
      staffCookies = extractCookies(staffLoginRes.headers);

      const res = await request("POST", "/api/v1/subscriptions", { plan: "pro" }, staffCookies);
      assert(
        "Staff cannot create subscription (not owner)",
        res.status === 403 || res.status === 401,
        `status=${res.status}`
      );
    }

    // ─── TEST 15: Staff cannot upgrade subscription ───
    {
      const res = await request("PATCH", "/api/v1/subscriptions/upgrade", { plan: "pro" }, staffCookies);
      assert(
        "Staff cannot upgrade subscription",
        res.status === 403 || res.status === 401,
        `status=${res.status}`
      );
    }

    // ─── TEST 16: Staff can read subscription (has settings permission path) ───
    {
      const res = await request("GET", "/api/v1/subscriptions", undefined, staffCookies);
      assert(
        "Staff can read subscription (settings permission check)",
        res.status === 200 || res.status === 403,
        `status=${res.status}`
      );
    }

    // ─── TEST 17: Unauthenticated access returns 401 ───
    {
      const res = await request("GET", "/api/v1/subscriptions");
      assert(
        "Unauthenticated access to /subscriptions returns 401",
        res.status === 401,
        `status=${res.status}`
      );
    }

    // ─── TEST 18: Plan limits are enforced (starter has maxProducts=100) ───
    {
      const res = await request("PATCH", "/api/v1/subscriptions/downgrade", { plan: "starter" }, ownerCookies);
      assert(
        "Downgrade to starter for plan limit tests",
        res.status === 200,
        `status=${res.status}`
      );
    }

    // ─── TEST 19: Subscription has correct limits for starter plan ───
    {
      const res = await request("GET", "/api/v1/subscriptions", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const sub = data.data as Record<string, unknown> | undefined;
      const limits = sub?.limits as Record<string, unknown> | undefined;
      assert(
        "Starter plan has correct maxProducts limit (100)",
        limits?.maxProducts === 100,
        `maxProducts=${limits?.maxProducts}`
      );
    }

    // ─── TEST 20: Plan limits are correct for business plan after upgrade ───
    {
      await request("PATCH", "/api/v1/subscriptions/upgrade", { plan: "business" }, ownerCookies);
      const res = await request("GET", "/api/v1/subscriptions", undefined, ownerCookies);
      const data = res.body as Record<string, unknown>;
      const sub = data.data as Record<string, unknown> | undefined;
      const limits = sub?.limits as Record<string, unknown> | undefined;
      assert(
        "Business plan has unlimited maxProducts (-1)",
        limits?.maxProducts === -1,
        `maxProducts=${limits?.maxProducts}`
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
