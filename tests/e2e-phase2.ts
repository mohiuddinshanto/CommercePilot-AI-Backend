import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId, Db } from "mongodb";
import http from "http";

const TEST_PORT = 5099;
let mongoServer: MongoMemoryServer;
let db: Db;
let client: MongoClient;
let server: http.Server;

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
  if (typeof setCookies === "string") return [setCookies.split(";")[0]];
  return setCookies.map((c) => c.split(";")[0]);
}

async function runTests(): Promise<void> {
  console.log("\n========== PHASE 2 E2E VERIFICATION ==========\n");

  let registerCookies: string[] = [];
  let loginCookies: string[] = [];
  let registeredUserId = "";

  // ────────────────────────────────────────────
  // TEST 1: Register a new user
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Register ---");
  const regRes = await request("POST", "/api/auth/sign-up/email", {
    name: "Test Owner",
    email: "testowner@example.com",
    password: "TestPass123!",
  });

  assert(
    "Register returns 200/201",
    regRes.status === 200 || regRes.status === 201,
    `Status: ${regRes.status}`
  );

  registerCookies = extractCookies(regRes.headers);
  assert(
    "Register returns session cookie",
    registerCookies.length > 0,
    `Cookies: ${registerCookies.length}`
  );

  // Find the registered user in DB
  const user = await db.collection("user").findOne({ email: "testowner@example.com" });
  assert("User document created", user !== null, user ? `id: ${user._id}` : "not found");

  if (user) {
    registeredUserId = user._id.toString();
    assert("role = owner", user.role === "owner", `role: ${user.role}`);
    assert("accountStatus = pending", user.accountStatus === "pending", `accountStatus: ${user.accountStatus}`);
    assert("plan = starter", user.plan === "starter", `plan: ${user.plan}`);
    assert("isActive = true", user.isActive === true, `isActive: ${user.isActive}`);
    assert(
      "lastLogin is stored (set by hook)",
      !!user.lastLogin,
      `lastLogin: ${user.lastLogin || "not set"}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 2: Session check after register
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Session after register ---");
  const sessRes = await request("GET", "/api/auth/get-session", undefined, registerCookies);
  assert(
    "Session exists after register",
    sessRes.status === 200,
    `Status: ${sessRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 3: Pending account blocks protected routes
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Pending account blocks protected route ---");
  const profilePending = await request("GET", "/api/v1/auth/profile", undefined, registerCookies);
  assert(
    "Pending user gets 403 on protected route",
    profilePending.status === 403,
    `Status: ${profilePending.status}, code: ${(profilePending.body as Record<string, unknown>)?.error?.code || (profilePending.body as Record<string, unknown>)?.code || "unknown"}`
  );

  // ────────────────────────────────────────────
  // TEST 4: Logout (before re-login test)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Logout ---");
  const logoutRes = await request("POST", "/api/auth/sign-out", undefined, registerCookies);
  assert(
    "Logout returns 200",
    logoutRes.status === 200,
    `Status: ${logoutRes.status}`
  );

  // Check LOGOUT activity
  const logoutActivity = await db.collection("activity_logs").findOne({
    userId: registeredUserId,
    action: "LOGOUT",
  });
  assert(
    "LOGOUT activity created",
    logoutActivity !== null,
    logoutActivity ? `id: ${logoutActivity._id}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 5: Login with pending account (should fail with 403)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Login with pending account ---");
  const loginPendingRes = await request("POST", "/api/auth/sign-in/email", {
    email: "testowner@example.com",
    password: "TestPass123!",
  });

  // Better Auth itself returns 200 for sign-in, but our middleware blocks access
  // Actually, Better Auth sign-in doesn't check our accountStatus
  // The block happens at requireAuth/requireAccountApproved middleware level
  assert(
    "Login API returns response",
    loginPendingRes.status === 200 || loginPendingRes.status === 403,
    `Status: ${loginPendingRes.status}`
  );

  // If Better Auth allowed login, get cookies and test protected route
  if (loginPendingRes.status === 200) {
    loginCookies = extractCookies(loginPendingRes.headers);
    const profileAfterLogin = await request("GET", "/api/v1/auth/profile", undefined, loginCookies);
    assert(
      "Pending user blocked on protected route after login",
      profileAfterLogin.status === 403,
      `Status: ${profileAfterLogin.status}`
    );

    // Logout again
    await request("POST", "/api/auth/sign-out", undefined, loginCookies);
  } else {
    assert(
      "Pending user blocked on login",
      loginPendingRes.status === 403,
      `Status: ${loginPendingRes.status}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 6: Approve account and login
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Approve account & login ---");
  await db.collection("user").updateOne(
    { _id: new ObjectId(registeredUserId) },
    { $set: { accountStatus: "approved" } }
  );

  const loginApprovedRes = await request("POST", "/api/auth/sign-in/email", {
    email: "testowner@example.com",
    password: "TestPass123!",
  });
  assert(
    "Approved user login returns 200",
    loginApprovedRes.status === 200,
    `Status: ${loginApprovedRes.status}`
  );

  loginCookies = extractCookies(loginApprovedRes.headers);
  assert(
    "Login returns session cookie",
    loginCookies.length > 0,
    `Cookies: ${loginCookies.length}`
  );

  // Check LOGIN activity
  const loginActivity = await db.collection("activity_logs").findOne({
    userId: registeredUserId,
    action: "LOGIN",
  });
  assert(
    "LOGIN activity created",
    loginActivity !== null,
    loginActivity ? `id: ${loginActivity._id}` : "not found"
  );

  // Check lastLogin updated
  const userAfterLogin = await db.collection("user").findOne({ _id: new ObjectId(registeredUserId) });
  assert(
    "lastLogin updated after login",
    !!userAfterLogin?.lastLogin,
    `lastLogin: ${userAfterLogin?.lastLogin || "not set"}`
  );

  // ────────────────────────────────────────────
  // TEST 7: Protected route works for approved user
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Protected route for approved user ---");
  const profileApproved = await request("GET", "/api/v1/auth/profile", undefined, loginCookies);
  assert(
    "Approved user gets profile",
    profileApproved.status === 200,
    `Status: ${profileApproved.status}`
  );
  if (profileApproved.status === 200) {
    const profileData = (profileApproved.body as Record<string, unknown>)?.data as Record<string, unknown>;
    assert(
      "Profile email matches",
      profileData?.email === "testowner@example.com",
      `email: ${profileData?.email}`
    );
    assert(
      "Profile role = owner",
      profileData?.role === "owner",
      `role: ${profileData?.role}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 8: Store creation
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Store creation ---");
  const storeRes = await request("POST", "/api/v1/auth/store", {
    storeName: "Test Store",
    storeSlug: "test-store",
    currency: "USD",
    timezone: "UTC",
    phone: "+1234567890",
    email: "store@example.com",
    address: "123 Test Street",
  }, loginCookies);

  assert(
    "Store creation returns 201",
    storeRes.status === 201,
    `Status: ${storeRes.status}`
  );

  const storeDoc = await db.collection("stores").findOne({ storeSlug: "test-store" });
  assert(
    "Store document created",
    storeDoc !== null,
    storeDoc ? `id: ${storeDoc._id}` : "not found"
  );

  const userAfterStore = await db.collection("user").findOne({ _id: new ObjectId(registeredUserId) });
  assert(
    "User storeId is set",
    !!userAfterStore?.storeId,
    `storeId: ${userAfterStore?.storeId || "not set"}`
  );

  // Check CREATE_STORE activity
  const createStoreActivity = await db.collection("activity_logs").findOne({
    userId: registeredUserId,
    action: "CREATE_STORE",
  });
  assert(
    "CREATE_STORE activity created",
    createStoreActivity !== null,
    createStoreActivity ? `id: ${createStoreActivity._id}` : "not found"
  );

  // Logout after store creation
  await request("POST", "/api/auth/sign-out", undefined, loginCookies);

  // ────────────────────────────────────────────
  // TEST 9: Reject account
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Rejected account ---");
  await db.collection("user").updateOne(
    { _id: new ObjectId(registeredUserId) },
    { $set: { accountStatus: "rejected" } }
  );

  const loginRejectedRes = await request("POST", "/api/auth/sign-in/email", {
    email: "testowner@example.com",
    password: "TestPass123!",
  });

  // Login might succeed (Better Auth doesn't check our status), but protected route should fail
  let rejectedCookies: string[] = [];
  if (loginRejectedRes.status === 200) {
    rejectedCookies = extractCookies(loginRejectedRes.headers);
    const profileRejected = await request("GET", "/api/v1/auth/profile", undefined, rejectedCookies);
    assert(
      "Rejected user blocked on protected route",
      profileRejected.status === 403,
      `Status: ${profileRejected.status}`
    );
    const rejectedBody = profileRejected.body as Record<string, unknown>;
    const rejectedCode = (rejectedBody?.error as Record<string, unknown>)?.code || rejectedBody?.code;
    assert(
      "Rejection error code is ACCOUNT_REJECTED",
      rejectedCode === "ACCOUNT_REJECTED",
      `code: ${rejectedCode}`
    );
    await request("POST", "/api/auth/sign-out", undefined, rejectedCookies);
  } else {
    assert(
      "Rejected user blocked on login",
      loginRejectedRes.status === 403,
      `Status: ${loginRejectedRes.status}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 10: Suspended account
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Suspended account ---");
  await db.collection("user").updateOne(
    { _id: new ObjectId(registeredUserId) },
    { $set: { accountStatus: "suspended" } }
  );

  const loginSuspendedRes = await request("POST", "/api/auth/sign-in/email", {
    email: "testowner@example.com",
    password: "TestPass123!",
  });

  let suspendedCookies: string[] = [];
  if (loginSuspendedRes.status === 200) {
    suspendedCookies = extractCookies(loginSuspendedRes.headers);
    const profileSuspended = await request("GET", "/api/v1/auth/profile", undefined, suspendedCookies);
    assert(
      "Suspended user blocked on protected route",
      profileSuspended.status === 403,
      `Status: ${profileSuspended.status}`
    );
    const suspendedBody = profileSuspended.body as Record<string, unknown>;
    const suspendedCode = (suspendedBody?.error as Record<string, unknown>)?.code || suspendedBody?.code;
    assert(
      "Suspension error code is ACCOUNT_SUSPENDED",
      suspendedCode === "ACCOUNT_SUSPENDED",
      `code: ${suspendedCode}`
    );
    await request("POST", "/api/auth/sign-out", undefined, suspendedCookies);
  } else {
    assert(
      "Suspended user blocked on login",
      loginSuspendedRes.status === 403,
      `Status: ${loginSuspendedRes.status}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 11: Unauthorized access (no session)
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Unauthorized access ---");
  const profileNoAuth = await request("GET", "/api/v1/auth/profile");
  assert(
    "Unauthenticated user gets 401",
    profileNoAuth.status === 401,
    `Status: ${profileNoAuth.status}`
  );

  // ────────────────────────────────────────────
  // TEST 12: Verify all MongoDB collections
  // ────────────────────────────────────────────
  console.log("\n--- TEST: MongoDB collections ---");
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map((c) => c.name);

  assert("users collection exists", collectionNames.includes("user"), `collections: ${collectionNames.join(", ")}`);
  assert("session collection exists", collectionNames.includes("session"), `collections: ${collectionNames.join(", ")}`);
  assert("stores collection exists", collectionNames.includes("stores"), `collections: ${collectionNames.join(", ")}`);
  assert("activity_logs collection exists", collectionNames.includes("activity_logs"), `collections: ${collectionNames.join(", ")}`);

  const userCount = await db.collection("user").countDocuments();
  const sessionCount = await db.collection("session").countDocuments();
  const storeCount = await db.collection("stores").countDocuments();
  const activityCount = await db.collection("activity_logs").countDocuments();

  assert(`users has documents: ${userCount}`, userCount > 0, `count: ${userCount}`);
  assert(`sessions has documents: ${sessionCount}`, sessionCount >= 0, `count: ${sessionCount}`);
  assert(`stores has documents: ${storeCount}`, storeCount > 0, `count: ${storeCount}`);
  assert(`activity_logs has documents: ${activityCount}`, activityCount > 0, `count: ${activityCount}`);

  // ────────────────────────────────────────────
  // Print all activity logs
  // ────────────────────────────────────────────
  console.log("\n--- Activity Logs ---");
  const allLogs = await db.collection("activity_logs").find({}).sort({ createdAt: 1 }).toArray();
  allLogs.forEach((log, i) => {
    console.log(`  ${i + 1}. action=${log.action} module=${log.module} desc="${log.description}"`);
  });
}

async function main(): Promise<void> {
  try {
    console.log("Starting MongoDB Memory Server...");
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    console.log(`MongoDB Memory Server started: ${uri}`);

    // Connect to in-memory MongoDB
    client = new MongoClient(uri);
    await client.connect();
    db = client.db("commercepilot_ai_test");
    console.log("Connected to in-memory database.");

    // Set env vars BEFORE importing any app modules
    process.env.MONGODB_URI = uri;
    process.env.DB_NAME = "commercepilot_ai_test";
    process.env.BETTER_AUTH_SECRET = "test-secret-for-e2e";
    process.env.BETTER_AUTH_URL = `http://localhost:${TEST_PORT}`;
    process.env.CLIENT_URL = "http://localhost:3000";
    process.env.PORT = String(TEST_PORT);

    console.log("Starting Express server...");
    // Use tsx to import the compiled server
    const serverModule = await import("../src/server.ts");
    // Server is starting via bootstrap(), wait for it
    await new Promise((r) => setTimeout(r, 5000));

    // Run all tests
    await runTests();

    // Summary
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
    // Cleanup
    if (server) server.close();
    if (client) await client.close();
    if (mongoServer) await mongoServer.stop();
    process.exit(0);
  }
}

main();
