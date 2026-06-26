import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";

/** Validate (and narrow) req.body against a Zod schema; on failure forward the
 *  ZodError to the error middleware, which renders a VALIDATION_ERROR. */
export const validateBody =
  (schema: ZodSchema): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
