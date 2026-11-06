/** Application error with a stable code and HTTP status. Safe to serialise to clients. */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const errors = {
  unauthenticated: (message = "Sign in to continue.") => new AppError("UNAUTHENTICATED", 401, message),
  forbidden: (message = "You do not have access to this action.") => new AppError("FORBIDDEN", 403, message),
  notFound: (message = "Not found.") => new AppError("NOT_FOUND", 404, message),
  conflict: (code: string, message: string, details?: unknown) => new AppError(code, 409, message, details),
  invalid: (message = "Invalid input.", details?: unknown) => new AppError("INVALID_INPUT", 422, message, details),
  rateLimited: () => new AppError("RATE_LIMITED", 429, "Too many requests. Please wait a moment and try again."),
  unavailable: (code: string, message: string) => new AppError(code, 503, message),
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
