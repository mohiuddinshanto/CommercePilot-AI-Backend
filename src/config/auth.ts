import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { ObjectId } from "mongodb";
import { getDatabase } from "./database.js";
import { environment } from "./environment.js";
import { ACTIVITY_ACTION, COLLECTIONS } from "../constants/index.js";
import { logger } from "../utils/logger.js";

// Better Auth has complex generic types.
// Using a focused interface for the parts we access.
interface AuthInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: any;
  api: {
    getSession: (params: { headers: Record<string, string> }) => Promise<unknown>;
  };
}

let authInstance: AuthInstance | null = null;

export function getAuth(): AuthInstance {
  if (!authInstance) {
    const db = getDatabase();

    const hasGoogle = !!(environment.GOOGLE_CLIENT_ID && environment.GOOGLE_CLIENT_SECRET);

    if (hasGoogle) {
      logger.info("[Auth] Google social provider ENABLED");
    } else {
      logger.warn("[Auth] Google social provider DISABLED — missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    }

    const auth = betterAuth({
      database: mongodbAdapter(db),
      secret: environment.BETTER_AUTH_SECRET,
      baseURL: environment.BETTER_AUTH_URL,
      trustedOrigins: [
        ...environment.CLIENT_ORIGINS,
        "https://commerce-pilot-ai-delta.vercel.app",
      ],
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
      },
      socialProviders: hasGoogle
        ? {
            google: {
              clientId: environment.GOOGLE_CLIENT_ID,
              clientSecret: environment.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
      },
      user: {
        additionalFields: {
          storeId: {
            type: "string",
            required: false,
            input: false,
          },
          phone: {
            type: "string",
            required: false,
          },
          role: {
            type: "string",
            required: false,
            input: false,
            defaultValue: "owner",
          },
          accountStatus: {
            type: "string",
            required: false,
            input: false,
            defaultValue: "pending",
          },
          plan: {
            type: "string",
            required: false,
            input: false,
            defaultValue: "starter",
          },
          isActive: {
            type: "boolean",
            required: false,
            input: false,
            defaultValue: true,
          },
          lastLogin: {
            type: "string",
            required: false,
            input: false,
          },
        },
      },
      databaseHooks: {
        session: {
          create: {
            after: async (session) => {
              try {
                const userCollection = db.collection(COLLECTIONS.USERS);
                const userId = new ObjectId(session.userId as string);
                const user = await userCollection.findOne({ _id: userId });

                if (!user) return;

                const now = new Date().toISOString();
                const isRegister = !user.lastLogin;
                const action = isRegister
                  ? ACTIVITY_ACTION.REGISTER
                  : ACTIVITY_ACTION.LOGIN;

                await userCollection.updateOne(
                  { _id: userId },
                  { $set: { lastLogin: now, updatedAt: now } }
                );

                const logEntry: Record<string, unknown> = {
                  userId: session.userId,
                  action,
                  module: "auth",
                  description: isRegister
                    ? "User registered and logged in."
                    : "User logged in.",
                  createdAt: now,
                };

                if (user.storeId) {
                  logEntry.storeId = user.storeId;
                }

                await db.collection(COLLECTIONS.ACTIVITY_LOGS).insertOne(logEntry);
              } catch (error) {
                logger.error("Session create hook error", error);
              }
            },
          },
          delete: {
            after: async (session) => {
              try {
                const userCollection = db.collection(COLLECTIONS.USERS);
                const userId = new ObjectId(session.userId as string);
                const user = await userCollection.findOne({ _id: userId });

                if (!user) return;

                const now = new Date().toISOString();

                const logEntry: Record<string, unknown> = {
                  userId: session.userId,
                  action: ACTIVITY_ACTION.LOGOUT,
                  module: "auth",
                  description: "User logged out.",
                  createdAt: now,
                };

                if (user.storeId) {
                  logEntry.storeId = user.storeId;
                }

                await db.collection(COLLECTIONS.ACTIVITY_LOGS).insertOne(logEntry);
              } catch (error) {
                logger.error("Session delete hook error", error);
              }
            },
          },
        },
      },
    });

    authInstance = auth as unknown as AuthInstance;
  }

  return authInstance;
}
