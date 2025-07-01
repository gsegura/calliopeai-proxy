import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { AuthenticatedUser } from '../interfaces/license';

interface AuthenticatedRequest extends Request {
  customer?: AuthenticatedUser;
  user?: {
    id: string;
    slug: string;
    email: string;
  };
}

/**
 * Security middleware for additional authentication checks and logging
 */
export class SecurityMiddleware {
  private static authService = AuthService.getInstance();

  /**
   * Middleware to check license expiration warnings
   */
  static checkLicenseExpiration = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.customer?.licenseData) {
      const expirationDate = new Date(req.customer.licenseData.expiresAt);
      const now = new Date();
      const daysUntilExpiry = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Add warning header if license expires within 7 days
      if (daysUntilExpiry <= 7) {
        res.set('X-License-Warning', `License expires in ${daysUntilExpiry} days`);
      }
    }
    next();
  };

  /**
   * Middleware to validate organization access
   */
  static validateOrganizationAccess = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.customer) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const organizationId = req.query.organizationId as string || req.body.organizationId;
    
    if (!SecurityMiddleware.authService.hasOrganizationAccess(req.customer, organizationId)) {
      res.status(403).json({ 
        error: 'Access denied', 
        details: 'Customer does not have access to this organization' 
      });
      return;
    }

    next();
  };

  /**
   * Middleware to log authentication events for security monitoring
   */
  static logAuthenticationEvents = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.customer) {
      const customerConfig = SecurityMiddleware.authService.getCustomerConfig(req.customer);
      
      // Log authentication for security monitoring
      console.info(`[AUTH] Customer: ${customerConfig.customerId}, IP: ${req.ip}, Endpoint: ${req.method} ${req.originalUrl}`);
      
      // Add customer context to response headers for debugging (non-sensitive data only)
      if (process.env.NODE_ENV === 'development') {
        res.set('X-Customer-ID', customerConfig.customerId);
      }
    }
    
    next();
  };

  /**
   * Middleware to add CORS headers for customer-specific API URLs
   */
  static addCustomerCorsHeaders = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.customer?.unsignedData.apiUrl) {
      const apiUrl = new URL(req.customer.unsignedData.apiUrl);
      res.set('Access-Control-Allow-Origin', apiUrl.origin);
    }
    next();
  };

  /**
   * Middleware to validate request size and rate limiting preparation
   */
  static validateRequestLimits = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Check request size (basic protection)
    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
      res.status(413).json({ 
        error: 'Request too large', 
        details: 'Maximum request size is 10MB' 
      });
      return;
    }

    // Prepare for rate limiting by adding customer identifier
    if (req.customer) {
      (req as any).rateLimitKey = `customer:${req.customer.customerId}`;
    }

    next();
  };
}

// Export individual middleware functions
export const checkLicenseExpiration = SecurityMiddleware.checkLicenseExpiration;
export const validateOrganizationAccess = SecurityMiddleware.validateOrganizationAccess;
export const logAuthenticationEvents = SecurityMiddleware.logAuthenticationEvents;
export const addCustomerCorsHeaders = SecurityMiddleware.addCustomerCorsHeaders;
export const validateRequestLimits = SecurityMiddleware.validateRequestLimits;
