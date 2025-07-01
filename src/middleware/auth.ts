import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { AuthenticatedUser } from '../interfaces/license';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    slug: string;
    email: string;
  };
  customer?: AuthenticatedUser;
}

/**
 * Enhanced Bearer token authentication middleware for Calliope licenses
 * Validates RSA-signed license tokens for customer authentication
 */
export const authenticateBearerToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authService = AuthService.getInstance();
  const authHeader = req.headers.authorization;

  // Extract Bearer token from Authorization header
  const bearerToken = authService.extractBearerToken(authHeader);

  if (!bearerToken) {
    const error = authService.getAuthenticationError(null);
    res.status(error.status).json({ 
      error: error.message,
      details: error.details 
    });
    return;
  }

  // Authenticate using license token
  const authenticatedCustomer = authService.authenticate(bearerToken);

  if (!authenticatedCustomer) {
    const error = authService.getAuthenticationError(bearerToken);
    res.status(error.status).json({ 
      error: error.message,
      details: error.details 
    });
    return;
  }

  // Attach customer information to request for use in controllers
  req.customer = authenticatedCustomer;

  // For backward compatibility, also set user info
  // This maps customer data to the existing user interface
  req.user = {
    id: authenticatedCustomer.customerId,
    slug: authenticatedCustomer.customerId,
    email: `${authenticatedCustomer.customerId}@customer.calliope.ai` // Synthetic email for compatibility
  };

  next();
};

/**
 * Export the AuthenticatedRequest interface for use in controllers
 */
export { AuthenticatedRequest };
