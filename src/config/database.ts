import { MongoClient, Db } from "mongodb";
import { environment } from "./environment";
import { logger } from "../utils/logger";
import { ensureIndexes } from "../database/indexes";

let client: MongoClient;
let db: Db;
let isReconnecting = false;

export async function connectDatabase(): Promise<Db> {
  try {
    client = new MongoClient(environment.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,
    });

    client.on("serverDescriptionChanged", () => {
      logger.info("MongoDB topology changed");
    });

    client.on("connectionPoolCreated", (event) => {
      logger.info("MongoDB connection pool created", { address: event.address });
    });

    client.on("connectionPoolClosed", () => {
      logger.warn("MongoDB connection pool closed");
    });

    client.on("error", (error) => {
      logger.error("MongoDB client error", { message: error.message });
    });

    client.on("close", () => {
      logger.warn("MongoDB connection closed");
      if (!isReconnecting && environment.NODE_ENV === "production") {
        attemptReconnect();
      }
    });

    await client.connect();
    db = client.db(environment.DB_NAME);

    await db.command({ ping: 1 });
    await ensureIndexes(db);

    logger.info("MongoDB connected successfully");
    return db;
  } catch (error) {
    logger.error("MongoDB connection failed", error);
    throw error;
  }
}

async function attemptReconnect(): Promise<void> {
  if (isReconnecting) return;
  isReconnecting = true;

  const maxAttempts = 10;
  let attempt = 0;

  const reconnect = async (): Promise<void> => {
    attempt++;
    const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);

    logger.info(`MongoDB reconnect attempt ${attempt}/${maxAttempts} in ${delayMs}ms`);

    await new Promise((resolve) => setTimeout(resolve, delayMs));

    try {
      const newClient = new MongoClient(environment.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        heartbeatFrequencyMS: 10000,
      });

      await newClient.connect();
      const testDb = newClient.db(environment.DB_NAME);
      await testDb.command({ ping: 1 });

      if (client) {
        try { await client.close(); } catch { /* ignore */ }
      }

      client = newClient;
      db = testDb;

      client.on("close", () => {
        if (!isReconnecting && environment.NODE_ENV === "production") {
          attemptReconnect();
        }
      });

      client.on("error", (error) => {
        logger.error("MongoDB client error", { message: error.message });
      });

      isReconnecting = false;
      logger.info("MongoDB reconnected successfully");
    } catch (error) {
      logger.error(`MongoDB reconnect attempt ${attempt} failed`, { message: (error as Error).message });

      if (attempt < maxAttempts) {
        await reconnect();
      } else {
        logger.error("MongoDB reconnect: max attempts reached. Server may need restart.");
        isReconnecting = false;
      }
    }
  };

  await reconnect();
}

export function getDatabase(): Db {
  if (!db) {
    throw new Error("Database not initialized. Call connectDatabase() first.");
  }
  return db;
}

export function getClient(): MongoClient {
  if (!client) {
    throw new Error("MongoDB client not initialized. Call connectDatabase() first.");
  }
  return client;
}

export function setDatabase(dbInstance: Db): void {
  db = dbInstance;
}

export async function disconnectDatabase(): Promise<void> {
  try {
    if (client) {
      await client.close();
      logger.info("MongoDB disconnected");
    }
  } catch (error) {
    logger.error("MongoDB disconnection failed", error);
  }
}
