import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean; // To distinguish between operational errors and programming errors
}

export const globalErrorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction // eslint-disable-line @typescript-eslint/no-unused-vars
) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal Server Error';

  // Log the error internally
  console.error('ERROR 💥', {
    message: err.message,
    stack: err.stack,
    statusCode: err.statusCode,
    isOperational: err.isOperational,
    path: req.path,
    method: req.method,
  });

  // For operational errors we trust, send details to the client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }
  // For programming or other unknown errors, don't leak error details
  else {
    // For non-operational errors in development, send full error
    if (process.env.NODE_ENV === 'development') {
      return res.status(err.statusCode).json({
        status: 'error',
        message: err.message,
        stack: err.stack,
        error: err,
      });
    }
    // In production, send generic message
    res.status(500).json({
      status: 'error',
      message: 'Something went very wrong!',
    });
  }
};
