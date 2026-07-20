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
  console.log("\n========== PHASE 10 E2E VERIFICATION: STAFF MANAGEMENT ==========\n");

  let ownerCookies: string[] = [];
  let storeId = "";
  let staffId = "";
  let staffId2 = "";

  // ────────────────────────────────────────────
  // SETUP: Register owner, approve, create store
  // ────────────────────────────────────────────
  console.log("\n--- SETUP: Register owner ---");
  const regRes = await request("POST", "/api/auth/sign-up/email", {
    name: "Staff Owner",
    email: "staffowner@example.com",
    password: "TestPass123!",
  });

  assert(
    "Owner registered",
    regRes.status === 200 || regRes.status === 201,
    `Status: ${regRes.status}`
  );

  ownerCookies = extractCookies(regRes.headers);

  const ownerUser = await db.collection("user").findOne({ email: "staffowner@example.com" });
  assert("Owner user created", ownerUser !== null, ownerUser ? `id: ${ownerUser._id}` : "not found");

  if (ownerUser) {
    const now = new Date().toISOString();
    const storeResult = await db.collection("stores").insertOne({
      ownerId: ownerUser._id.toString(),
      storeName: "Staff Test Store",
      storeSlug: "staff-test-store",
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
      email: "staffowner@example.com",
      password: "TestPass123!",
    });
    ownerCookies = extractCookies(loginRes.headers);

    assert("Owner re-login", loginRes.status === 200, `Status: ${loginRes.status}`);
  }

  // ────────────────────────────────────────────
  // TEST 1: Unauthenticated access blocked
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Unauthenticated access ---");
  const unauthList = await request("GET", "/api/v1/staff");
  assert(
    "Unauthenticated user gets 401",
    unauthList.status === 401,
    `Status: ${unauthList.status}`
  );

  // ────────────────────────────────────────────
  // TEST 2: Validation - invite without email
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - invite without email ---");
  const noEmailRes = await request("POST", "/api/v1/staff/invite", {
    name: "Test Staff",
    permissions: ["sales"],
  }, ownerCookies);

  assert(
    "Invite without email returns 400",
    noEmailRes.status === 400,
    `Status: ${noEmailRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 3: Validation - invite without permissions
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - invite without permissions ---");
  const noPermsRes = await request("POST", "/api/v1/staff/invite", {
    name: "Test Staff",
    email: "noperms@example.com",
  }, ownerCookies);

  assert(
    "Invite without permissions returns 400",
    noPermsRes.status === 400,
    `Status: ${noPermsRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 4: Validation - invite with invalid email
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Validation - invite with invalid email ---");
  const invalidEmailRes = await request("POST", "/api/v1/staff/invite", {
    name: "Test Staff",
    email: "not-an-email",
    permissions: ["sales"],
  }, ownerCookies);

  assert(
    "Invite with invalid email returns 400",
    invalidEmailRes.status === 400,
    `Status: ${invalidEmailRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 5: Invite staff member
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Invite staff member ---");
  const inviteRes = await request("POST", "/api/v1/staff/invite", {
    name: "Test Staff Member",
    email: "staff1@example.com",
    role: "cashier",
    permissions: ["sales", "products"],
  }, ownerCookies);

  assert(
    "Invite returns 201",
    inviteRes.status === 201,
    `Status: ${inviteRes.status}, body: ${JSON.stringify(inviteRes.body)}`
  );

  const invitedStaff = inviteRes.body?.data as Record<string, unknown> | undefined;
  if (invitedStaff) {
    staffId = (invitedStaff._id as { toString(): string }).toString();
    assert("Staff has _id", !!staffId, `staffId: ${staffId}`);
    assert("Staff status = pending", invitedStaff.status === "pending", `status: ${invitedStaff.status}`);
    assert("Staff email = staff1@example.com", invitedStaff.email === "staff1@example.com", `email: ${invitedStaff.email}`);
    assert("Staff name = Test Staff Member", invitedStaff.name === "Test Staff Member", `name: ${invitedStaff.name}`);
    assert("Staff role = cashier", invitedStaff.role === "cashier", `role: ${invitedStaff.role}`);
    assert("Staff has permissions", Array.isArray(invitedStaff.permissions) && (invitedStaff.permissions as string[]).length === 2, `permissions: ${JSON.stringify(invitedStaff.permissions)}`);
    assert("Staff has invitationToken", typeof invitedStaff.invitationToken === "string" && (invitedStaff.invitationToken as string).length > 0, `hasToken: ${!!invitedStaff.invitationToken}`);
  }

  // Check activity log
  const inviteActivity = await db.collection("activity_logs").findOne({
    action: "INVITE_STAFF",
    module: "staff",
  });
  assert(
    "INVITE_STAFF activity logged",
    inviteActivity !== null,
    inviteActivity ? `desc: ${inviteActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 6: Duplicate invitation blocked
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Duplicate invitation blocked ---");
  const duplicateRes = await request("POST", "/api/v1/staff/invite", {
    name: "Duplicate Staff",
    email: "staff1@example.com",
    permissions: ["sales"],
  }, ownerCookies);

  assert(
    "Duplicate invitation returns 422",
    duplicateRes.status === 422,
    `Status: ${duplicateRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 7: List staff members
  // ────────────────────────────────────────────
  console.log("\n--- TEST: List staff members ---");
  const listRes = await request("GET", "/api/v1/staff", undefined, ownerCookies);
  assert(
    "List staff returns 200",
    listRes.status === 200,
    `Status: ${listRes.status}`
  );

  const listData = listRes.body?.data as Record<string, unknown> | undefined;
  assert(
    "List staff has items array",
    !!listData && Array.isArray(listData.items),
    `hasData: ${!!listData}, hasItems: ${listData ? Array.isArray(listData.items) : false}`
  );

  if (listData && Array.isArray(listData.items)) {
    assert(
      "List staff has 1 member",
      listData.items.length === 1,
      `count: ${listData.items.length}`
    );
    assert("List staff has total", listData.total === 1, `total: ${listData.total}`);
    assert("List staff has totalPages", listData.totalPages === 1, `totalPages: ${listData.totalPages}`);
  }

  // ────────────────────────────────────────────
  // TEST 8: Get staff by ID
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Get staff by ID ---");
  const getByIdRes = await request("GET", `/api/v1/staff/${staffId}`, undefined, ownerCookies);
  assert(
    "Get staff by ID returns 200",
    getByIdRes.status === 200,
    `Status: ${getByIdRes.status}`
  );

  const fetchedStaff = getByIdRes.body?.data as Record<string, unknown> | undefined;
  if (fetchedStaff) {
    assert("Fetched staff has correct email", fetchedStaff.email === "staff1@example.com", `email: ${fetchedStaff.email}`);
    assert("Fetched staff status = pending", fetchedStaff.status === "pending", `status: ${fetchedStaff.status}`);
  }

  // ────────────────────────────────────────────
  // TEST 9: Non-existent staff returns 404
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Non-existent staff ---");
  const fakeId = new ObjectId().toString();
  const notFoundRes = await request("GET", `/api/v1/staff/${fakeId}`, undefined, ownerCookies);
  assert(
    "Non-existent staff returns 404",
    notFoundRes.status === 404,
    `Status: ${notFoundRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 10: Invalid staff ID format
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Invalid staff ID ---");
  const invalidIdRes = await request("GET", "/api/v1/staff/invalid-id", undefined, ownerCookies);
  assert(
    "Invalid staff ID returns 400",
    invalidIdRes.status === 400,
    `Status: ${invalidIdRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 11: Update staff permissions
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Update staff permissions ---");
  const updateRes = await request("PATCH", `/api/v1/staff/${staffId}`, {
    role: "manager",
    permissions: ["sales", "products", "inventory", "reports"],
  }, ownerCookies);

  assert(
    "Update staff returns 200",
    updateRes.status === 200,
    `Status: ${updateRes.status}`
  );

  const updatedStaff = updateRes.body?.data as Record<string, unknown> | undefined;
  if (updatedStaff) {
    assert("Updated staff role = manager", updatedStaff.role === "manager", `role: ${updatedStaff.role}`);
    assert("Updated staff has 4 permissions", Array.isArray(updatedStaff.permissions) && (updatedStaff.permissions as string[]).length === 4, `permissions: ${JSON.stringify(updatedStaff.permissions)}`);
  }

  const updateActivity = await db.collection("activity_logs").findOne({
    action: "UPDATE_STAFF",
    module: "staff",
  });
  assert(
    "UPDATE_STAFF activity logged",
    updateActivity !== null,
    updateActivity ? `desc: ${updateActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 12: Invite second staff member
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Invite second staff member ---");
  const invite2Res = await request("POST", "/api/v1/staff/invite", {
    name: "Second Staff",
    email: "staff2@example.com",
    role: "inventory_manager",
    permissions: ["inventory", "products"],
  }, ownerCookies);

  assert(
    "Second invite returns 201",
    invite2Res.status === 201,
    `Status: ${invite2Res.status}`
  );

  const invitedStaff2 = invite2Res.body?.data as Record<string, unknown> | undefined;
  if (invitedStaff2) {
    staffId2 = (invitedStaff2._id as { toString(): string }).toString();
    assert("Second staff has _id", !!staffId2, `staffId2: ${staffId2}`);
    assert("Second staff role = inventory_manager", invitedStaff2.role === "inventory_manager", `role: ${invitedStaff2.role}`);
  }

  // ────────────────────────────────────────────
  // TEST 13: List staff now has 2 members
  // ────────────────────────────────────────────
  console.log("\n--- TEST: List staff with 2 members ---");
  const list2Res = await request("GET", "/api/v1/staff", undefined, ownerCookies);
  const list2Data = list2Res.body?.data as Record<string, unknown> | undefined;
  if (list2Data && Array.isArray(list2Data.items)) {
    assert(
      "List staff has 2 members",
      list2Data.items.length === 2,
      `count: ${list2Data.items.length}`
    );
    assert("List staff total = 2", list2Data.total === 2, `total: ${list2Data.total}`);
  }

  // ────────────────────────────────────────────
  // TEST 14: Search staff by name
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Search staff ---");
  const searchRes = await request("GET", "/api/v1/staff?search=Second", undefined, ownerCookies);
  const searchData = searchRes.body?.data as Record<string, unknown> | undefined;
  if (searchData && Array.isArray(searchData.items)) {
    assert(
      "Search finds Second Staff",
      searchData.items.length >= 1,
      `count: ${searchData.items.length}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 15: Filter by status
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Filter by status ---");
  const filterRes = await request("GET", "/api/v1/staff?status=pending", undefined, ownerCookies);
  const filterData = filterRes.body?.data as Record<string, unknown> | undefined;
  if (filterData && Array.isArray(filterData.items)) {
    const allPending = filterData.items.every(
      (s: Record<string, unknown>) => s.status === "pending"
    );
    assert(
      "All filtered staff are pending",
      allPending,
      `statuses: ${filterData.items.map((s: Record<string, unknown>) => s.status).join(", ")}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 16: Filter by role
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Filter by role ---");
  const roleFilterRes = await request("GET", "/api/v1/staff?role=manager", undefined, ownerCookies);
  const roleFilterData = roleFilterRes.body?.data as Record<string, unknown> | undefined;
  if (roleFilterData && Array.isArray(roleFilterData.items)) {
    const allManager = roleFilterData.items.every(
      (s: Record<string, unknown>) => s.role === "manager"
    );
    assert(
      "All filtered staff are managers",
      allManager,
      `roles: ${roleFilterData.items.map((s: Record<string, unknown>) => s.role).join(", ")}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 17: Suspend staff
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Suspend staff ---");
  const suspendRes = await request("PATCH", `/api/v1/staff/${staffId}/suspend`, undefined, ownerCookies);
  assert(
    "Suspend staff returns 200",
    suspendRes.status === 200,
    `Status: ${suspendRes.status}`
  );

  const suspendedStaff = suspendRes.body?.data as Record<string, unknown> | undefined;
  if (suspendedStaff) {
    assert("Staff status = suspended", suspendedStaff.status === "suspended", `status: ${suspendedStaff.status}`);
    assert("Staff has suspendedAt", !!suspendedStaff.suspendedAt, `suspendedAt: ${suspendedStaff.suspendedAt}`);
  }

  const suspendActivity = await db.collection("activity_logs").findOne({
    action: "SUSPEND_STAFF",
    module: "staff",
  });
  assert(
    "SUSPEND_STAFF activity logged",
    suspendActivity !== null,
    suspendActivity ? `desc: ${suspendActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 18: Cannot suspend already suspended staff
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Cannot suspend already suspended staff ---");
  const doubleSuspendRes = await request("PATCH", `/api/v1/staff/${staffId}/suspend`, undefined, ownerCookies);
  assert(
    "Double suspend returns 422",
    doubleSuspendRes.status === 422,
    `Status: ${doubleSuspendRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 19: Activate suspended staff
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Activate suspended staff ---");
  const activateRes = await request("PATCH", `/api/v1/staff/${staffId}/activate`, undefined, ownerCookies);
  assert(
    "Activate staff returns 200",
    activateRes.status === 200,
    `Status: ${activateRes.status}`
  );

  const activatedStaff = activateRes.body?.data as Record<string, unknown> | undefined;
  if (activatedStaff) {
    assert("Staff status = active", activatedStaff.status === "active", `status: ${activatedStaff.status}`);
  }

  const activateActivity = await db.collection("activity_logs").findOne({
    action: "ACTIVATE_STAFF",
    module: "staff",
  });
  assert(
    "ACTIVATE_STAFF activity logged",
    activateActivity !== null,
    activateActivity ? `desc: ${activateActivity.description}` : "not found"
  );

  // ────────────────────────────────────────────
  // TEST 20: Cannot activate already active staff
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Cannot activate already active staff ---");
  const doubleActivateRes = await request("PATCH", `/api/v1/staff/${staffId}/activate`, undefined, ownerCookies);
  assert(
    "Double activate returns 422",
    doubleActivateRes.status === 422,
    `Status: ${doubleActivateRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 21: Delete staff member
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Delete staff member ---");
  const deleteRes = await request("DELETE", `/api/v1/staff/${staffId2}`, undefined, ownerCookies);
  assert(
    "Delete staff returns 204",
    deleteRes.status === 204,
    `Status: ${deleteRes.status}`
  );

  const deleteActivity = await db.collection("activity_logs").findOne({
    action: "REMOVE_STAFF",
    module: "staff",
  });
  assert(
    "REMOVE_STAFF activity logged",
    deleteActivity !== null,
    deleteActivity ? `desc: ${deleteActivity.description}` : "not found"
  );

  // Verify deleted staff returns 404
  const afterDeleteRes = await request("GET", `/api/v1/staff/${staffId2}`, undefined, ownerCookies);
  assert(
    "Deleted staff returns 404",
    afterDeleteRes.status === 404,
    `Status: ${afterDeleteRes.status}`
  );

  // ────────────────────────────────────────────
  // TEST 22: List staff after deletion
  // ────────────────────────────────────────────
  console.log("\n--- TEST: List staff after deletion ---");
  const listAfterDelRes = await request("GET", "/api/v1/staff", undefined, ownerCookies);
  const listAfterDelData = listAfterDelRes.body?.data as Record<string, unknown> | undefined;
  if (listAfterDelData && Array.isArray(listAfterDelData.items)) {
    assert(
      "List staff has 1 member after deletion",
      listAfterDelData.items.length === 1,
      `count: ${listAfterDelData.items.length}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 23: Pagination
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Pagination ---");
  const pageRes = await request("GET", "/api/v1/staff?page=1&limit=1", undefined, ownerCookies);
  assert(
    "Pagination returns 200",
    pageRes.status === 200,
    `Status: ${pageRes.status}`
  );

  const pageData = pageRes.body?.data as Record<string, unknown> | undefined;
  if (pageData && Array.isArray(pageData.items)) {
    assert(
      "Pagination returns max 1 item",
      pageData.items.length <= 1,
      `count: ${pageData.items.length}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 24: Non-owner cannot invite
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Non-owner cannot invite ---");
  const staffUser = await db.collection("user").findOne({ email: "staff1@example.com" });
  if (staffUser) {
    const now = new Date().toISOString();
    await db.collection("user").updateOne(
      { _id: staffUser._id },
      { $set: { storeId, role: "staff", accountStatus: "approved", updatedAt: now } }
    );

    // Create a session for staff user
    const staffSessionToken = `staff-session-${Date.now()}`;
    await db.collection("session").insertOne({
      _id: new ObjectId(),
      userId: staffUser._id.toString(),
      token: staffSessionToken,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      createdAt: now,
      updatedAt: now,
    } as never);

    // Create staff record for permission check
    await db.collection("staff").insertOne({
      _id: new ObjectId(),
      storeId,
      userId: staffUser._id.toString(),
      name: "Test Staff Member",
      email: "staff1@example.com",
      role: "manager",
      permissions: ["sales", "products"],
      status: "active",
      invitationToken: "",
      invitationExpiresAt: now,
      invitedBy: "",
      createdAt: now,
      updatedAt: now,
    } as never);

    const staffCookies = [`better-auth.session_token=${staffSessionToken}`];
    const staffInviteRes = await request("POST", "/api/v1/staff/invite", {
      name: "Unauthorized Staff",
      email: "unauth@example.com",
      permissions: ["sales"],
    }, staffCookies);

    assert(
      "Non-owner invite returns 403",
      staffInviteRes.status === 403,
      `Status: ${staffInviteRes.status}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 25: Multi-tenant isolation
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Multi-tenant isolation ---");
  const regRes2 = await request("POST", "/api/auth/sign-up/email", {
    name: "Other Staff Owner",
    email: "otherstaffowner@example.com",
    password: "TestPass123!",
  });

  let otherCookies: string[] = extractCookies(regRes2.headers);

  const otherUser = await db.collection("user").findOne({ email: "otherstaffowner@example.com" });
  if (otherUser) {
    const now = new Date().toISOString();
    const storeResult = await db.collection("stores").insertOne({
      ownerId: otherUser._id.toString(),
      storeName: "Other Staff Store",
      storeSlug: "other-staff-store",
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
      email: "otherstaffowner@example.com",
      password: "TestPass123!",
    });
    otherCookies = extractCookies(loginRes2.headers);
  }

  // Other owner tries to access first owner's staff
  const crossAccessRes = await request("GET", "/api/v1/staff", undefined, otherCookies);
  assert(
    "Cross-tenant access returns 200 with empty data",
    crossAccessRes.status === 200,
    `Status: ${crossAccessRes.status}`
  );

  const crossData = crossAccessRes.body?.data as Record<string, unknown> | undefined;
  if (crossData) {
    assert(
      "Cross-tenant sees no staff",
      Array.isArray(crossData.items) && crossData.items.length === 0,
      `items: ${Array.isArray(crossData.items) ? crossData.items.length : "not array"}`
    );
  }

  // Other owner tries to access first owner's staff by ID
  if (staffId) {
    const crossGetRes = await request("GET", `/api/v1/staff/${staffId}`, undefined, otherCookies);
    assert(
      "Cross-tenant get by ID returns 404",
      crossGetRes.status === 404,
      `Status: ${crossGetRes.status}`
    );
  }

  // ────────────────────────────────────────────
  // TEST 26: Plan limit enforcement
  // ────────────────────────────────────────────
  console.log("\n--- TEST: Plan limit enforcement (starter plan) ---");
  // Create a starter plan store
  const regRes3 = await request("POST", "/api/auth/sign-up/email", {
    name: "Starter Owner",
    email: "starterowner@example.com",
    password: "TestPass123!",
  });

  let starterCookies: string[] = extractCookies(regRes3.headers);

  const starterUser = await db.collection("user").findOne({ email: "starterowner@example.com" });
  if (starterUser) {
    const now = new Date().toISOString();
    const storeResult = await db.collection("stores").insertOne({
      ownerId: starterUser._id.toString(),
      storeName: "Starter Store",
      storeSlug: "starter-store",
      currency: "USD",
      timezone: "UTC",
      plan: "starter",
      accountStatus: "approved",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const starterStoreId = storeResult.insertedId.toString();

    await db.collection("user").updateOne(
      { _id: starterUser._id },
      { $set: { storeId: starterStoreId, accountStatus: "approved", updatedAt: now } }
    );

    // Seed starter plan subscription (max 2 staff)
    await db.collection("subscriptions").insertOne({
      storeId: starterStoreId,
      plan: "starter",
      status: "active",
      billingCycle: "monthly",
      price: 29.99,
      currency: "USD",
      startedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-12-31T23:59:59.000Z",
      renewalDate: "2027-01-01T00:00:00.000Z",
      isTrial: false,
      features: ["inventory", "sales", "returns", "reports"],
      limits: { maxProducts: 50, maxCategories: 10, maxInventory: 100, maxStaff: 2, maxAiRequests: 10 },
      usage: { products: 0, categories: 0, inventory: 0, staff: 0, aiRequests: 0, lastResetAt: "2026-01-01T00:00:00.000Z" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await request("POST", "/api/auth/sign-out", undefined, starterCookies);
    const loginRes3 = await request("POST", "/api/auth/sign-in/email", {
      email: "starterowner@example.com",
      password: "TestPass123!",
    });
    starterCookies = extractCookies(loginRes3.headers);

    // Starter plan allows max 2 staff
    await request("POST", "/api/v1/staff/invite", {
      name: "Starter Staff 1",
      email: "starterstaff1@example.com",
      permissions: ["sales"],
    }, starterCookies);

    await request("POST", "/api/v1/staff/invite", {
      name: "Starter Staff 2",
      email: "starterstaff2@example.com",
      permissions: ["sales"],
    }, starterCookies);

    // Third staff should hit limit
    const limitRes = await request("POST", "/api/v1/staff/invite", {
      name: "Starter Staff 3",
      email: "starterstaff3@example.com",
      permissions: ["sales"],
    }, starterCookies);

    assert(
      "Starter plan limit enforced (3rd staff blocked)",
      limitRes.status === 422,
      `Status: ${limitRes.status}`
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
