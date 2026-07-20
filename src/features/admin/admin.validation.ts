import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../utils/error-handler.js";

export function validateUpdateStoreStatus(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const { status } = req.body;

  if (!status) {
    next(new ValidationError("Validation failed.", [
      { field: "status", message: "Status is required." },
    ]));
    return;
  }

  const validStatuses = ["approved", "rejected", "suspended"];
  if (!validStatuses.includes(status)) {
    next(new ValidationError("Validation failed.", [
      { field: "status", message: `Status must be one of: ${validStatuses.join(", ")}` },
    ]));
    return;
  }

  next();
}

export function validateUpdateUserStatus(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const { status } = req.body;

  if (!status) {
    next(new ValidationError("Validation failed.", [
      { field: "status", message: "Status is required." },
    ]));
    return;
  }

  const validStatuses = ["approved", "rejected", "suspended"];
  if (!validStatuses.includes(status)) {
    next(new ValidationError("Validation failed.", [
      { field: "status", message: `Status must be one of: ${validStatuses.join(", ")}` },
    ]));
    return;
  }

  next();
}

export function validateUpdateSubscription(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const { plan, status, billingCycle } = req.body;

  if (!plan && !status && !billingCycle) {
    next(new ValidationError("Validation failed.", [
      { field: "updates", message: "At least one of plan, status, or billingCycle must be provided." },
    ]));
    return;
  }

  if (plan) {
    const validPlans = ["starter", "pro", "business"];
    if (!validPlans.includes(plan)) {
      next(new ValidationError("Validation failed.", [
        { field: "plan", message: `Plan must be one of: ${validPlans.join(", ")}` },
      ]));
      return;
    }
  }

  if (status) {
    const validStatuses = ["active", "cancelled", "expired", "trialing"];
    if (!validStatuses.includes(status)) {
      next(new ValidationError("Validation failed.", [
        { field: "status", message: `Status must be one of: ${validStatuses.join(", ")}` },
      ]));
      return;
    }
  }

  if (billingCycle) {
    const validCycles = ["monthly", "yearly"];
    if (!validCycles.includes(billingCycle)) {
      next(new ValidationError("Validation failed.", [
        { field: "billingCycle", message: `Billing cycle must be one of: ${validCycles.join(", ")}` },
      ]));
      return;
    }
  }

  next();
}
