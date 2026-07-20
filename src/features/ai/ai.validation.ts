import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../utils/error-handler";

export function validateChatInput(req: Request, _res: Response, next: NextFunction): void {
  const errors: { field: string; message: string }[] = [];
  const { message, conversationId, model } = req.body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    errors.push({ field: "message", message: "Required" });
  } else if (message.length > 4000) {
    errors.push({ field: "message", message: "Too long" });
  }

  if (conversationId !== undefined && (typeof conversationId !== "string" || conversationId.trim().length === 0)) {
    errors.push({ field: "conversationId", message: "Invalid" });
  }

  if (model !== undefined && typeof model !== "string") {
    errors.push({ field: "model", message: "Invalid" });
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}
