import type { RequestHandler } from "express";

// Express 4 doesn't forward rejected promises to the error middleware; this wrapper
// catches async errors and passes them to next().
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
