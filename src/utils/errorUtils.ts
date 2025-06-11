// Utility functions for standardized error responses

export interface StandardErrorResponse {
  error: string;
  message?: string;
  details?: any;
  statusCode?: number;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(message: string, statusCode: number = 500, details?: any, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

export const createStandardError = (message: string, statusCode: number = 500, details?: any): AppError => {
  return new AppError(message, statusCode, details);
};

// Common error types
export const createValidationError = (message: string, details?: any): AppError => {
  return new AppError(message, 400, details);
};

export const createAuthError = (message: string = 'Unauthorized'): AppError => {
  return new AppError(message, 401);
};

export const createNotFoundError = (message: string = 'Resource not found'): AppError => {
  return new AppError(message, 404);
};

export const createInternalError = (message: string = 'Internal server error', details?: any): AppError => {
  return new AppError(message, 500, details, false);
};
