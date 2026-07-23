// @vitest-environment node
import type { NextFunction, Request, Response } from "express";

import { apiErrorHandler } from "../../src/server/http-errors";

it("logs the original exception while returning a generic HTTP 500 payload", () => {
  const error = new Error("repository query failed");
  const logError = vi.fn();
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();

  apiErrorHandler(
    error,
    { log: { error: logError } } as unknown as Request,
    { status, json } as unknown as Response,
    vi.fn() as unknown as NextFunction,
  );

  expect(logError).toHaveBeenCalledWith({ err: error }, "Unhandled API error");
  expect(status).toHaveBeenCalledWith(500);
  expect(json).toHaveBeenCalledWith({
    error: "An unexpected server error occurred.",
    code: "INTERNAL_ERROR",
  });
});
