import { MongoClient, ObjectId } from "mongodb";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });

const MONGODB_URI = process.env.MONGODB_URI!;
const DB_NAME = process.env.DB_NAME || "commercepilot_ai";
const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "dev-secret-change-in-production-min-32-chars!!";
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || "http://localhost:5000";

if (!MONGODB_URI) {
  console.error("MONGODB_URI not set");
  process.exit(1);
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function now(): string {
  return new Date().toISOString();
}

const DEMO_EMAIL = "testowner@example.com";
const DEMO_PASSWORD = "TestPass123!";

const CATEGORIES = [
  { name: "Electronics", description: "Gadgets, phones, and accessories" },
  { name: "Clothing", description: "Apparel and fashion items" },
  { name: "Home & Kitchen", description: "Furniture, decor, and kitchenware" },
  { name: "Books", description: "Physical and digital books" },
  { name: "Sports", description: "Fitness and outdoor gear" },
];

const PRODUCTS = [
  { cat: "Electronics", name: "Wireless Bluetooth Headphones", sku: "ELEC-WBH-001", costPrice: 25, sellingPrice: 59.99, discountPrice: 49.99, stock: 120, tags: ["bluetooth", "headphones", "wireless"], priority: "high" as const, shortDescription: "Premium noise-cancelling wireless headphones with 30hr battery life" },
  { cat: "Electronics", name: "USB-C Fast Charger 65W", sku: "ELEC-CHG-002", costPrice: 12, sellingPrice: 29.99, stock: 200, tags: ["charger", "usb-c", "fast-charge"], priority: "medium" as const, shortDescription: "GaN USB-C charger compatible with laptops, tablets, and phones" },
  { cat: "Electronics", name: "Portable Power Bank 20000mAh", sku: "ELEC-PWR-003", costPrice: 18, sellingPrice: 44.99, discountPrice: 39.99, stock: 85, tags: ["power-bank", "portable", "charger"], priority: "medium" as const, shortDescription: "High-capacity portable charger with dual USB output" },
  { cat: "Electronics", name: "Smart LED Desk Lamp", sku: "ELEC-LMP-004", costPrice: 20, sellingPrice: 49.99, stock: 60, tags: ["desk-lamp", "led", "smart"], priority: "low" as const, shortDescription: "Adjustable LED desk lamp with wireless charging base" },
  { cat: "Electronics", name: "Wireless Mouse & Keyboard Combo", sku: "ELEC-CMB-005", costPrice: 15, sellingPrice: 39.99, stock: 150, tags: ["mouse", "keyboard", "wireless"], priority: "medium" as const, shortDescription: "Ergonomic wireless mouse and keyboard set with long battery life" },
  { cat: "Electronics", name: "Webcam 1080p HD", sku: "ELEC-WCM-006", costPrice: 22, sellingPrice: 54.99, stock: 75, tags: ["webcam", "1080p", "streaming"], priority: "high" as const, shortDescription: "Full HD webcam with built-in microphone for video calls" },

  { cat: "Clothing", name: "Classic Cotton T-Shirt", sku: "CLTH-TSH-001", costPrice: 5, sellingPrice: 19.99, stock: 300, tags: ["t-shirt", "cotton", "casual"], priority: "medium" as const, shortDescription: "100% cotton crew neck t-shirt available in multiple colors" },
  { cat: "Clothing", name: "Slim Fit Denim Jeans", sku: "CLTH-JNS-002", costPrice: 18, sellingPrice: 49.99, discountPrice: 44.99, stock: 120, tags: ["jeans", "denim", "slim-fit"], priority: "high" as const, shortDescription: "Modern slim fit jeans with stretch comfort" },
  { cat: "Clothing", name: "Zip-Up Hoodie", sku: "CLTH-HDD-003", costPrice: 15, sellingPrice: 39.99, stock: 90, tags: ["hoodie", "zip-up", "winter"], priority: "medium" as const, shortDescription: "Warm fleece-lined hoodie with kangaroo pockets" },
  { cat: "Clothing", name: "Running Sneakers", sku: "CLTH-SNK-004", costPrice: 25, sellingPrice: 69.99, discountPrice: 59.99, stock: 75, tags: ["sneakers", "running", "athletic"], priority: "high" as const, shortDescription: "Lightweight running sneakers with cushioned sole" },
  { cat: "Clothing", name: "Formal Dress Shirt", sku: "CLTH-SHT-005", costPrice: 12, sellingPrice: 34.99, stock: 100, tags: ["shirt", "formal", "dress"], priority: "low" as const, shortDescription: "Classic fit dress shirt for business and formal occasions" },

  { cat: "Home & Kitchen", name: "Stainless Steel Water Bottle", sku: "HOME-BTL-001", costPrice: 6, sellingPrice: 18.99, stock: 250, tags: ["bottle", "stainless", "eco-friendly"], priority: "medium" as const, shortDescription: "Double-walled insulated water bottle, keeps drinks cold 24hrs" },
  { cat: "Home & Kitchen", name: "Non-Stick Frying Pan Set", sku: "HOME-PAN-002", costPrice: 20, sellingPrice: 49.99, discountPrice: 44.99, stock: 60, tags: ["frying-pan", "non-stick", "kitchen"], priority: "high" as const, shortDescription: "3-piece non-stick frying pan set with heat-resistant handles" },
  { cat: "Home & Kitchen", name: "Memory Foam Pillow", sku: "HOME-PIL-003", costPrice: 10, sellingPrice: 29.99, stock: 130, tags: ["pillow", "memory-foam", "sleep"], priority: "medium" as const, shortDescription: "Ergonomic memory foam pillow for neck support" },
  { cat: "Home & Kitchen", name: "Robot Vacuum Cleaner", sku: "HOME-VAC-004", costPrice: 120, sellingPrice: 249.99, discountPrice: 199.99, stock: 30, tags: ["vacuum", "robot", "cleaning"], priority: "high" as const, shortDescription: "Smart robot vacuum with mapping and app control" },
  { cat: "Home & Kitchen", name: "Bamboo Cutting Board Set", sku: "HOME-BCB-005", costPrice: 8, sellingPrice: 24.99, stock: 100, tags: ["cutting-board", "bamboo", "kitchen"], priority: "low" as const, shortDescription: "3-piece organic bamboo cutting board set" },

  { cat: "Books", name: "JavaScript: The Definitive Guide", sku: "BOOK-JSG-001", costPrice: 20, sellingPrice: 44.99, stock: 50, tags: ["javascript", "programming", "reference"], priority: "high" as const, shortDescription: "Comprehensive guide to JavaScript for web developers" },
  { cat: "Books", name: "The Art of Business", sku: "BOOK-BUS-002", costPrice: 8, sellingPrice: 22.99, stock: 70, tags: ["business", "entrepreneurship", "strategy"], priority: "medium" as const, shortDescription: "Essential strategies for building a successful business" },
  { cat: "Books", name: "Modern Interior Design", sku: "BOOK-DES-003", costPrice: 15, sellingPrice: 34.99, stock: 40, tags: ["design", "interior", "home"], priority: "low" as const, shortDescription: "Inspiration and guide for modern interior design" },

  { cat: "Sports", name: "Yoga Mat Premium", sku: "SPRT-YGA-001", costPrice: 10, sellingPrice: 29.99, stock: 100, tags: ["yoga", "mat", "fitness"], priority: "medium" as const, shortDescription: "6mm thick non-slip yoga mat with carrying strap" },
  { cat: "Sports", name: "Adjustable Dumbbell Set", sku: "SPRT-DBL-002", costPrice: 40, sellingPrice: 99.99, discountPrice: 89.99, stock: 40, tags: ["dumbbell", "weights", "home-gym"], priority: "high" as const, shortDescription: "Adjustable dumbbell set ranging from 5-25 lbs each" },
  { cat: "Sports", name: "Insulated Gym Bag", sku: "SPRT-GBG-003", costPrice: 12, sellingPrice: 34.99, stock: 80, tags: ["gym-bag", "sports", "carrying"], priority: "low" as const, shortDescription: "Large capacity gym bag with separate shoe compartment" },
  { cat: "Sports", name: "Resistance Bands Set", sku: "SPRT-RBS-004", costPrice: 5, sellingPrice: 16.99, stock: 180, tags: ["resistance-bands", "fitness", "stretching"], priority: "medium" as const, shortDescription: "Set of 5 resistance bands for full body workout" },
  { cat: "Sports", name: "Stainless Steel Shaker Bottle", sku: "SPRT-SHK-005", costPrice: 7, sellingPrice: 19.99, stock: 140, tags: ["shaker", "bottle", "protein"], priority: "low" as const, shortDescription: "BPA-free stainless steel shaker bottle for protein drinks" },
];

async function seed() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    console.log(`Connected to ${DB_NAME}`);

    // --- Step 1: Create demo user via better-auth ---
    const auth = betterAuth({
      database: mongodbAdapter(db),
      secret: BETTER_AUTH_SECRET,
      baseURL: BETTER_AUTH_URL,
      emailAndPassword: { enabled: true },
      user: {
        additionalFields: {
          storeId: { type: "string", required: false, input: false },
          phone: { type: "string", required: false },
          role: { type: "string", required: false, input: false, defaultValue: "owner" },
          accountStatus: { type: "string", required: false, input: false, defaultValue: "approved" },
          plan: { type: "string", required: false, input: false, defaultValue: "starter" },
          isActive: { type: "boolean", required: false, input: false, defaultValue: true },
          lastLogin: { type: "string", required: false, input: false },
        },
      },
    });

    let userId: string;

    const existingUser = await db.collection("user").findOne({ email: DEMO_EMAIL });
    if (existingUser) {
      userId = existingUser._id.toString();
      console.log(`Demo user already exists: ${DEMO_EMAIL} (${userId})`);
    } else {
      const signUpResult = await auth.api.signUpEmail({
        body: {
          name: "Demo Owner",
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userId = (signUpResult as any).user?.id || (signUpResult as any).id;
      if (!userId) {
        console.error("Failed to create demo user:", signUpResult);
        process.exit(1);
      }
      // Ensure accountStatus is approved
      await db.collection("user").updateOne(
        { _id: new ObjectId(userId) },
        { $set: { accountStatus: "approved", role: "owner", isActive: true, updatedAt: now() } }
      );
      console.log(`Created demo user: ${DEMO_EMAIL} (${userId})`);
    }

    // --- Step 2: Create demo store ---
    let storeId: string;
    const existingStore = await db.collection("stores").findOne({ ownerId: userId });
    if (existingStore) {
      storeId = existingStore._id.toString();
      console.log(`Demo store already exists: ${existingStore.storeName} (${storeId})`);
    } else {
      const storeIdObj = new ObjectId();
      storeId = storeIdObj.toString();
      await db.collection("stores").insertOne({
        _id: storeIdObj,
        ownerId: userId,
        storeName: "Demo Store",
        storeSlug: "demo-store",
        currency: "USD",
        timezone: "UTC",
        plan: "starter",
        accountStatus: "approved",
        isActive: true,
        createdAt: now(),
        updatedAt: now(),
      });
      await db.collection("user").updateOne(
        { _id: new ObjectId(userId) },
        { $set: { storeId, accountStatus: "approved", updatedAt: now() } }
      );
      console.log(`Created demo store: Demo Store (${storeId})`);
    }

    // --- Step 3: Create subscription for the store ---
    const existingSub = await db.collection("subscriptions").findOne({ storeId });
    if (!existingSub) {
      await db.collection("subscriptions").insertOne({
        _id: new ObjectId(),
        storeId,
        plan: "starter",
        billingCycle: "monthly",
        status: "active",
        currentPeriodStart: now(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: now(),
        updatedAt: now(),
      });
      console.log("Created starter subscription");
    }

    // --- Step 4: Clear existing categories/products for this store ---
    await db.collection("categories").deleteMany({ storeId });
    await db.collection("products").deleteMany({ storeId });
    console.log("Cleared existing categories and products");

    // --- Step 5: Create categories ---
    const catDocs = CATEGORIES.map((c) => ({
      _id: new ObjectId(),
      storeId,
      name: c.name,
      slug: slugify(c.name),
      description: c.description,
      status: "active",
      sortOrder: 0,
      isDeleted: false,
      createdAt: now(),
      updatedAt: now(),
    }));

    await db.collection("categories").insertMany(catDocs);
    const catIds: Record<string, string> = {};
    for (let i = 0; i < CATEGORIES.length; i++) {
      catIds[CATEGORIES[i].name] = catDocs[i]._id.toString();
    }
    console.log(`Inserted ${catDocs.length} categories`);

    // --- Step 6: Create products ---
    const prodDocs = PRODUCTS.map((p) => ({
      _id: new ObjectId(),
      storeId,
      categoryId: catIds[p.cat],
      sku: p.sku,
      barcode: "",
      name: p.name,
      slug: slugify(p.name),
      shortDescription: p.shortDescription,
      description: p.shortDescription,
      images: [],
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      discountPrice: p.discountPrice ?? undefined,
      stock: p.stock,
      lowStockLimit: 10,
      status: "active",
      tags: p.tags,
      priority: p.priority,
      availableFrom: now(),
      isDeleted: false,
      createdAt: now(),
      updatedAt: now(),
    }));

    await db.collection("products").insertMany(prodDocs);
    console.log(`Inserted ${prodDocs.length} products`);

    console.log("\n=== Seed Complete ===");
    console.log(`Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } finally {
    await client.close();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
