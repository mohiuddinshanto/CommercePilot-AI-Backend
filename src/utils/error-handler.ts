interface ValidationErrorDetail {
  field: string;
  message: string;
}

interface AppErrorOptions {
  statusCode: number;
  code: string;
  message: string;
  details?: ValidationErrorDetail[];
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ValidationErrorDetail[];

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: ValidationErrorDetail[]) {
    super({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message,
      details,
    });
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required.") {
    super({
      statusCode: 401,
      code: "UNAUTHORIZED",
      message,
    });
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super({
      statusCode: 403,
      code: "FORBIDDEN",
      message,
    });
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super({
      statusCode: 404,
      code: "NOT_FOUND",
      message: `${resource} not found.`,
    });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super({
      statusCode: 409,
      code: "CONFLICT",
      message,
    });
    this.name = "ConflictError";
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super({
      statusCode: 422,
      code: "BUSINESS_RULE_FAILED",
      message,
    });
    this.name = "BusinessRuleError";
  }
}

export class AccountPendingError extends AppError {
  constructor(message = "Your account is awaiting approval.") {
    super({
      statusCode: 403,
      code: "ACCOUNT_PENDING",
      message,
    });
    this.name = "AccountPendingError";
  }
}

export class AccountRejectedError extends AppError {
  constructor(message = "Your account has been rejected.") {
    super({
      statusCode: 403,
      code: "ACCOUNT_REJECTED",
      message,
    });
    this.name = "AccountRejectedError";
  }
}

export class AccountSuspendedError extends AppError {
  constructor(message = "Your account has been suspended.") {
    super({
      statusCode: 403,
      code: "ACCOUNT_SUSPENDED",
      message,
    });
    this.name = "AccountSuspendedError";
  }
}

export class DatabaseError extends AppError {
  constructor(message = "Database operation failed.") {
    super({
      statusCode: 500,
      code: "DATABASE_ERROR",
      message,
    });
    this.name = "DatabaseError";
  }
}

export class AIServiceError extends AppError {
  constructor(message = "AI service is temporarily unavailable.") {
    super({
      statusCode: 503,
      code: "AI_SERVICE_UNAVAILABLE",
      message,
    });
    this.name = "AIServiceError";
  }
}
