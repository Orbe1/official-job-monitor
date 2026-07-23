import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import type { ApiErrorPayload } from "../shared/domain";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(resource: string): HttpError {
  return new HttpError(404, "NOT_FOUND", `${resource} was not found.`);
}

export function conflict(message: string, details?: unknown): HttpError {
  return new HttpError(409, "CONFLICT", message, details);
}

export function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>,
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}

export function apiNotFound(request: Request, response: Response): void {
  const payload: ApiErrorPayload = {
    error: `No API route matches ${request.method} ${request.path}.`,
    code: "ROUTE_NOT_FOUND",
  };
  response.status(404).json(payload);
}

export function apiErrorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction,
): void {
  void _next;
  if (error instanceof ZodError) {
    const payload: ApiErrorPayload = {
      error: "The request did not pass validation.",
      code: "VALIDATION_ERROR",
      details: error.flatten(),
    };
    response.status(400).json(payload);
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    const payload: ApiErrorPayload = {
      error: "The request body is not valid JSON.",
      code: "INVALID_JSON",
    };
    response.status(400).json(payload);
    return;
  }

  if (error instanceof HttpError) {
    const payload: ApiErrorPayload = {
      error: error.message,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
    response.status(error.status).json(payload);
    return;
  }

  // Keep implementation details out of API responses while retaining the full
  // exception in backend logs for a local or production operator.
  request.log?.error({ err: error }, "Unhandled API error");
  const payload: ApiErrorPayload = {
    error: "An unexpected server error occurred.",
    code: "INTERNAL_ERROR",
  };
  response.status(500).json(payload);
}
