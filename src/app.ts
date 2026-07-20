import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { toNodeHandler } from "better-auth/node";
import { environment, validateEnvironment } from "./config/environment.js";
import { connectDatabase, getDatabase } from "./config/database.js";
import { getAuth } from "./config/auth.js";
import { apiRoutes } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";

const SHUTDOWN_TIMEOUT_MS = 30_000;

let dbConnected = false;

async function ensureDb(): Promise<void> {
  if (!dbConnected) {
    validateEnvironment();
    await connectDatabase();
    dbConnected = true;
  }
}

export async function createApp(): Promise<express.Express> {
  await ensureDb();

  const app = express();


  app.use(helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  const allowedOrigins = [
    ...environment.CLIENT_ORIGINS,
    "https://commerce-pilot-ai-delta.vercel.app",
  ].filter(Boolean);

  // cors handles preflight requests too. Keeping it as the single CORS handler.
  // This lets Express return the allowed origin and credentials headers directly.
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      // Allow configured origins
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow Vercel preview deployments
      if (origin.endsWith(".vercel.app")) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));

  app.use(compression());

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use((_req, res, next) => {
    res.setTimeout(SHUTDOWN_TIMEOUT_MS, () => {
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          message: "Request timeout.",
          error: { code: "REQUEST_TIMEOUT" },
        });
      }
    });
    next();
  });

  const auth = getAuth();

  app.get("/api/auth/debug-providers", (_req, res) => {
    res.json({
      hasGoogleClientId: !!environment.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!environment.GOOGLE_CLIENT_SECRET,
      betterAuthUrl: environment.BETTER_AUTH_URL,
    });
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: {
      success: false,
      message: "Too many requests. Please try again later.",
      error: { code: "RATE_LIMIT_EXCEEDED" },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: {
      success: false,
      message: "Too many API requests. Please try again later.",
      error: { code: "API_RATE_LIMIT_EXCEEDED" },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    message: {
      success: false,
      message: "Too many AI requests. Please try again later.",
      error: { code: "AI_RATE_LIMIT_EXCEEDED" },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api/auth/sign-up/*", authLimiter);
  app.use("/api/auth/sign-in/*", authLimiter);
  app.all("/api/auth/*", toNodeHandler(auth));

  app.use("/api/v1/ai", aiLimiter);
  app.use("/api/v1", apiLimiter, apiRoutes);

  app.get("/health", async (_req, res) => {
    const checks: Record<string, string> = { api: "ok" };
    let isHealthy = true;

    try {
      const db = getDatabase();
      await db.command({ ping: 1 });
      checks.mongodb = "ok";
    } catch {
      checks.mongodb = "unavailable";
      isHealthy = false;
    }

    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json({
      status: isHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  });

  app.get("/ready", async (_req, res) => {
    try {
      const db = getDatabase();
      await db.command({ ping: 1 });
      res.json({ status: "ready", timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: "not ready", timestamp: new Date().toISOString() });
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
