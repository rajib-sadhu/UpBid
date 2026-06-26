import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { AppError } from "../lib/errors.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    return;
  }
  // multer rejects (file too large, too many files, unexpected field, …).
  if (err instanceof MulterError) {
    res.status(400).json({ code: "VALIDATION_ERROR", message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res
      .status(400)
      .json({ code: "VALIDATION_ERROR", message: "Invalid request", details: err.flatten() });
    return;
  }
  // express.json() throws a SyntaxError (with a `body` property) on malformed JSON.
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ code: "VALIDATION_ERROR", message: "Malformed JSON body" });
    return;
  }
  console.error("[unhandled]", err);
  res.status(500).json({ code: "INTERNAL", message: "Internal server error" });
};
