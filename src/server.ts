import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { toNodeHandler } from "better-auth/node";
import { environment, validateEnvironment } from "./config/environment";
import { connectDatabase, disconnectDatabase, getDatabase } from "./config/database";
import { getAuth } from "./config/auth";
import { apiRoutes } from "./routes/index";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { logger } from "./utils/logger";

const SHUTDOWN_TIMEOUT_MS = 30_000;

async function bootstrap(): Promise<void> {
  validateEnvironment();

  const app = express();

  app.use(helmet());

  app.use(cors({
    origin: environment.CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));

  app.use(compression());

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use((_req, res, next) => {
    res.setTimeout(SHUTDOWN_TIMEOUT_MS, () => {
      logger.warn("Request timeout", { url: _req.originalUrl, method: _req.method });
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

  await connectDatabase();

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

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled Rejection", { reason: String(reason) });
  });

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception", { message: error.message, stack: error.stack });
    process.exit(1);
  });

  const server = app.listen(environment.PORT, () => {
    logger.info(`CommercePilot AI Backend running on port ${environment.PORT}`);
    logger.info(`Environment: ${environment.NODE_ENV}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received. Shutting down gracefully...`);

    const forceExitTimeout = setTimeout(() => {
      logger.error("Forced shutdown due to timeout");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    server.close(async () => {
      await disconnectDatabase();
      clearTimeout(forceExitTimeout);
      logger.info("Server shut down.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((error) => {
  logger.error("Failed to start server", error);
  process.exit(1);
});
