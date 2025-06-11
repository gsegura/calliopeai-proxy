import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError, StandardErrorResponse } from '../utils/errorUtils';

export const globalErrorHandler = (
  err: AppError | Error, 
  req: Request, 
  res: Response, 
  next: NextFunction // eslint-disable-line @typescript-eslint/no-unused-vars
): void => {
  // Set default values
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details: any = undefined;
  let isOperational = false;

  // Handle AppError instances
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
    isOperational = err.isOperational;
  } else {
    // Handle other Error types
    message = err.message || message;
    // Check if it's a known error type that should be operational
    if (err.name === 'ValidationError' || err.name === 'CastError') {
      statusCode = 400;
      isOperational = true;
    }
  }

  // Log the error internally
  console.error('ERROR 💥', {
    message: err.message,
    stack: err.stack,
    statusCode,
    isOperational,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  // Prepare the standard error response
  const errorResponse: StandardErrorResponse = {
    error: message,
    statusCode,
  };

  // For operational errors we trust, send details to the client
  if (isOperational) {
    if (details) {
      errorResponse.details = details;
    }
    res.status(statusCode).json(errorResponse);
  }
  // For programming or other unknown errors, don't leak error details
  else {
    // For non-operational errors in development, send full error
    if (process.env.NODE_ENV === 'development') {
      errorResponse.message = err.message;
      errorResponse.details = {
        stack: err.stack,
        name: err.name,
      };
      res.status(statusCode).json(errorResponse);
      return;
    }
    // In production, send generic message
    res.status(500).json({
      error: 'Something went very wrong!',
      statusCode: 500,
    });
  }
};
