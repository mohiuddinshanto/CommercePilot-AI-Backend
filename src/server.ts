import { createApp } from "./app.js";
import { environment, validateEnvironment } from "./config/environment.js";
import { disconnectDatabase } from "./config/database.js";
import { logger } from "./utils/logger.js";

const SHUTDOWN_TIMEOUT_MS = 30_000;

async function main(): Promise<void> {
  validateEnvironment();
  const app = await createApp();

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

main().catch((error) => {
  logger.error("Failed to start server", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection", { reason: String(reason) });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", { message: error.message, stack: error.stack });
  process.exit(1);
});
