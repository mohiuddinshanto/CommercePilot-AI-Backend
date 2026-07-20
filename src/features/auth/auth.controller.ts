import { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service";
import { sendSuccess, sendCreated } from "../../utils/api-response";
import { AppError } from "../../utils/error-handler";

export class AuthController {
  constructor(private service: AuthService) {}

  getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError({
          statusCode: 401,
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        });
      }

      const profile = await this.service.getUserProfile(userId);
      sendSuccess(res, "Profile retrieved successfully.", profile);
    } catch (error) {
      next(error);
    }
  };

  createStore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError({
          statusCode: 401,
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        });
      }

      const { storeName, storeSlug, currency, timezone, phone, email, address } = req.body;

      const result = await this.service.createStore(userId, {
        storeName,
        storeSlug,
        currency,
        timezone,
        phone,
        email,
        address,
      });

      sendCreated(res, "Store created successfully. Awaiting approval.", result);
    } catch (error) {
      next(error);
    }
  };

  getSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await this.service.getSession(req.headers as Record<string, string>);
      sendSuccess(res, "Session retrieved successfully.", session);
    } catch (error) {
      next(error);
    }
  };
}
