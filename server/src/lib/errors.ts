import type { ErrorCode } from "shared";

/** An error carrying a stable wire code + HTTP status. Thrown by services/controllers
 *  and rendered by the central error middleware into `{ code, message, details? }`. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode | string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  validation: (details?: unknown) =>
    new AppError("VALIDATION_ERROR", "Invalid request", 400, details),
  unauthenticated: (message = "Authentication required") =>
    new AppError("UNAUTHENTICATED", message, 401),
  invalidCredentials: () =>
    new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401),
  forbidden: (message = "You do not have access to this resource") =>
    new AppError("FORBIDDEN", message, 403),
  notFound: (message = "Not found") => new AppError("NOT_FOUND", message, 404),
  emailTaken: () => new AppError("EMAIL_TAKEN", "Email is already in use", 409),
  conflict: (message = "Resource is in use") => new AppError("CONFLICT", message, 409),
  sportMismatch: (message = "Player sport does not match the league") =>
    new AppError("SPORT_MISMATCH", message, 400),
  invalidState: (message = "Action not allowed in the current state") =>
    new AppError("INVALID_STATE", message, 409),
};
