import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../utils/error-handler.js";
import { SOCIAL_PLATFORM, INBOX_CONVERSATION_STATUS } from "../../constants/index.js";

export function validateCreateConnection(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  const allowedPlatforms = Object.values(SOCIAL_PLATFORM);
  if (!body.platform || !allowedPlatforms.includes(body.platform)) {
    errors.push({ field: "platform", message: `Platform must be one of: ${allowedPlatforms.join(", ")}.` });
  }

  if (!body.pageId || typeof body.pageId !== "string" || body.pageId.trim().length < 1) {
    errors.push({ field: "pageId", message: "Page ID is required." });
  }

  if (!body.pageAccessToken || typeof body.pageAccessToken !== "string" || body.pageAccessToken.trim().length < 10) {
    errors.push({ field: "pageAccessToken", message: "A valid Page Access Token is required." });
  }

  if (body.pageName !== undefined && (typeof body.pageName !== "string" || body.pageName.trim().length < 1)) {
    errors.push({ field: "pageName", message: "Page name must be a non-empty string." });
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}

export function validateUpdateConnection(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (body.pageAccessToken !== undefined && (typeof body.pageAccessToken !== "string" || body.pageAccessToken.trim().length < 10)) {
    errors.push({ field: "pageAccessToken", message: "A valid Page Access Token is required." });
  }

  if (body.pageName !== undefined && (typeof body.pageName !== "string" || body.pageName.trim().length < 1)) {
    errors.push({ field: "pageName", message: "Page name must be a non-empty string." });
  }

  if (body.active !== undefined && typeof body.active !== "boolean") {
    errors.push({ field: "active", message: "active must be a boolean." });
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}

export function validateSendMessage(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (!body.text || typeof body.text !== "string" || body.text.trim().length === 0) {
    errors.push({ field: "text", message: "Message text is required." });
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}

export function validateUpdateConversation(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const errors: { field: string; message: string }[] = [];
  const body = req.body;

  if (body.status !== undefined) {
    const allowedStatuses = Object.values(INBOX_CONVERSATION_STATUS);
    if (!allowedStatuses.includes(body.status)) {
      errors.push({ field: "status", message: `Status must be one of: ${allowedStatuses.join(", ")}.` });
    }
  }

  if (body.assignedTo !== undefined && body.assignedTo !== null && typeof body.assignedTo !== "string") {
    errors.push({ field: "assignedTo", message: "assignedTo must be a user ID or null." });
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}
