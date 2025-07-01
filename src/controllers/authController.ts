import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { LicenseService } from '../services/licenseService';

interface AuthenticatedRequest extends Request {
  customer?: any; // From authentication middleware
}

/**
 * Controller for authentication and license management endpoints
 */
export class AuthController {
  private authService: AuthService;
  private licenseService: LicenseService;

  constructor() {
    this.authService = AuthService.getInstance();
    this.licenseService = LicenseService.getInstance();
  }

  /**
   * GET /auth/health
   * Health check endpoint that validates the current license
   */
  public health = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const bearerToken = this.authService.extractBearerToken(authHeader);

      if (!bearerToken) {
        res.status(401).json({
          status: 'error',
          message: 'No license token provided',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const validation = this.authService.validateToken(bearerToken);

      if (validation.isValid) {
        res.status(200).json({
          status: 'healthy',
          license: {
            customerId: validation.licenseData?.customerId,
            expiresAt: validation.licenseData?.expiresAt,
            daysUntilExpiry: validation.daysUntilExpiry,
            apiUrl: validation.unsignedData?.apiUrl
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(401).json({
          status: 'unhealthy',
          error: validation.error,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Health check error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error during health check',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * GET /auth/license-info
   * Returns license information for the authenticated customer
   */
  public licenseInfo = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.customer) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const licenseInfo = {
        customerId: req.customer.customerId,
        apiUrl: req.customer.apiUrl,
        expiresAt: req.customer.licenseData.expiresAt,
        createdAt: req.customer.licenseData.createdAt,
        daysUntilExpiry: Math.ceil(
          (new Date(req.customer.licenseData.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      };

      res.status(200).json({
        license: licenseInfo,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('License info error:', error);
      res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * POST /auth/validate-token
   * Validates a license token without authentication (for testing)
   */
  public validateToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({
          error: 'Token is required',
          details: 'Provide token in request body'
        });
        return;
      }

      const validation = this.licenseService.validateLicense(token);

      res.status(200).json({
        isValid: validation.isValid,
        error: validation.error,
        licenseData: validation.isValid ? validation.licenseData : undefined,
        unsignedData: validation.isValid ? validation.unsignedData : undefined,
        daysUntilExpiry: validation.daysUntilExpiry,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Token validation error:', error);
      res.status(500).json({
        error: 'Internal server error during token validation',
        timestamp: new Date().toISOString()
      });
    }
  };
}
