import { Response } from "express";

interface PaginationData {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface SuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
}

interface ErrorDetail {
  field?: string;
  message: string;
}

interface ErrorResponse {
  success: false;
  message: string;
  error: {
    code: string;
    details?: ErrorDetail[];
  };
}

export function sendSuccess<T>(res: Response, message: string, data: T, statusCode = 200): void {
  const response: SuccessResponse<T> = {
    success: true,
    message,
    data,
  };
  res.status(statusCode).json(response);
}

export function sendCreated<T>(res: Response, message: string, data: T): void {
  sendSuccess(res, message, data, 201);
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  pagination: PaginationData
): void {
  const response: SuccessResponse<{ items: T[]; pagination: PaginationData }> = {
    success: true,
    message: "Data retrieved successfully.",
    data: { items, pagination },
  };
  res.status(200).json(response);
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  code: string,
  details?: ErrorDetail[]
): void {
  const response: ErrorResponse = {
    success: false,
    message,
    error: {
      code,
      details,
    },
  };
  res.status(statusCode).json(response);
}

export function sendNoContent(res: Response): void {
  res.status(204).send();
}
