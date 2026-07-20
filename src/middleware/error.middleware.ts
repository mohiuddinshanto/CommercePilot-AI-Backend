import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/error-handler.js";
import { sendError } from "../utils/api-response.js";
import { logger } from "../utils/logger.js";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    sendError(
      res,
      err.statusCode,
      err.message,
      err.code,
      err.details
    );
    return;
  }

  logger.error("Unexpected error", {
    route: req.originalUrl,
    method: req.method,
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    userId: (req as unknown as Record<string, unknown>).userId,
  });

  sendError(
    res,
    500,
    "Internal server error.",
    "INTERNAL_SERVER_ERROR"
  );
}

export function notFoundHandler(_req: Request, res: Response): void {
  sendError(
    res,
    404,
    "The requested resource was not found.",
    "NOT_FOUND"
  );
}
