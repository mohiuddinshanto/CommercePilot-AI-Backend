import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../../utils/error-handler";
import { PLANS } from "../../constants";

const VALID_PLANS = Object.values(PLANS);
const VALID_BILLING_CYCLES = ["monthly", "yearly"];

export function validateCreateSubscription(req: Request, _res: Response, next: NextFunction): void {
  const errors: { field: string; message: string }[] = [];
  const { plan, billingCycle } = req.body;

  if (!plan || !VALID_PLANS.includes(plan)) {
    errors.push({ field: "plan", message: `Plan must be one of: ${VALID_PLANS.join(", ")}.` });
  }

  if (billingCycle && !VALID_BILLING_CYCLES.includes(billingCycle)) {
    errors.push({ field: "billingCycle", message: `Billing cycle must be one of: ${VALID_BILLING_CYCLES.join(", ")}.` });
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}

export function validateUpgradePlan(req: Request, _res: Response, next: NextFunction): void {
  const errors: { field: string; message: string }[] = [];
  const { plan, billingCycle } = req.body;

  if (!plan || !VALID_PLANS.includes(plan)) {
    errors.push({ field: "plan", message: `Plan must be one of: ${VALID_PLANS.join(", ")}.` });
  }

  if (billingCycle && !VALID_BILLING_CYCLES.includes(billingCycle)) {
    errors.push({ field: "billingCycle", message: `Billing cycle must be one of: ${VALID_BILLING_CYCLES.join(", ")}.` });
  }

  if (errors.length > 0) {
    next(new ValidationError("Validation failed.", errors));
    return;
  }

  next();
}
