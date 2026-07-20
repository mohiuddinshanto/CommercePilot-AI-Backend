import dotenv from "dotenv";
import { logger } from "../utils/logger.js";

dotenv.config();

function parseOrigins(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

const clientUrlRaw = process.env.CLIENT_URL || "http://localhost:3000";

export const environment = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "5000", 10),
  MONGODB_URI: process.env.MONGODB_URI || "",
  DB_NAME: process.env.DB_NAME || "commercepilot_ai",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:5000",
  CLIENT_URL: clientUrlRaw,
  CLIENT_ORIGINS: parseOrigins(clientUrlRaw),
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
};

export function validateEnvironment(): void {
  const required = [
    "MONGODB_URI",
    "BETTER_AUTH_SECRET",
  ];

  for (const key of required) {
    if (!environment[key as keyof typeof environment]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  if (environment.NODE_ENV === "production") {
    const productionRequired = [
      "CLIENT_URL",
      "BETTER_AUTH_URL",
    ];

    for (const key of productionRequired) {
      if (!environment[key as keyof typeof environment]) {
        throw new Error(`Missing required production environment variable: ${key}`);
      }
    }

    if (environment.BETTER_AUTH_SECRET.length < 32) {
      throw new Error("BETTER_AUTH_SECRET must be at least 32 characters in production");
    }

    if (environment.BETTER_AUTH_URL.startsWith("http://")) {
      logger.warn("[WARN] BETTER_AUTH_URL uses HTTP. Use HTTPS in production.");
    }
  }
}
