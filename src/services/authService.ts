import { LicenseService } from './licenseService';
import { AuthenticatedUser, ValidatedLicense } from '../interfaces/license';
import { createValidationError } from '../utils/errorUtils';

/**
 * Authentication Service for Calliope Proxy
 * 
 * Handles customer authentication using Calliope license tokens.
 * Each customer has their own proxy instance with a unique license.
 */
export class AuthService {
  private static instance: AuthService;
  private licenseService: LicenseService;

  private constructor() {
    this.licenseService = LicenseService.getInstance();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Authenticates a user based on Bearer token (Calliope license)
   * @param bearerToken The Bearer token from Authorization header
   * @returns Authenticated user information or null if invalid
   */
  public authenticate(bearerToken: string): AuthenticatedUser | null {
    try {
      // Validate the license token
      const validation: ValidatedLicense = this.licenseService.validateLicense(bearerToken);

      if (!validation.isValid) {
        console.warn(`Authentication failed: ${validation.error}`);
        return null;
      }

      if (!validation.licenseData || !validation.unsignedData) {
        console.warn('Authentication failed: Valid license but missing data');
        return null;
      }

      // Create authenticated user object
      const authenticatedUser: AuthenticatedUser = {
        customerId: validation.licenseData.customerId,
        apiUrl: validation.unsignedData.apiUrl,
        licenseData: validation.licenseData,
        unsignedData: validation.unsignedData
      };

      // Log successful authentication (for monitoring)
      console.info(`Customer authenticated: ${validation.licenseData.customerId}, expires in ${validation.daysUntilExpiry} days`);

      // Warn if license expires soon (within 30 days)
      if (validation.daysUntilExpiry && validation.daysUntilExpiry <= 30) {
        console.warn(`License for customer ${validation.licenseData.customerId} expires in ${validation.daysUntilExpiry} days`);
      }

      return authenticatedUser;

    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  }

  /**
   * Validates a Bearer token and returns validation details
   * Used for health checks and token introspection
   * @param bearerToken The Bearer token to validate
   * @returns Validation result
   */
  public validateToken(bearerToken: string): ValidatedLicense {
    return this.licenseService.validateLicense(bearerToken);
  }

  /**
   * Extracts Bearer token from Authorization header
   * @param authorizationHeader The Authorization header value
   * @returns Bearer token or null if invalid format
   */
  public extractBearerToken(authorizationHeader: string | undefined): string | null {
    if (!authorizationHeader) {
      return null;
    }

    if (!authorizationHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authorizationHeader.substring(7).trim();
    return token.length > 0 ? token : null;
  }

  /**
   * Gets authentication error details for better error responses
   * @param bearerToken The Bearer token that failed authentication
   * @returns Error details
   */
  public getAuthenticationError(bearerToken: string | null): { status: number; message: string; details?: string } {
    if (!bearerToken) {
      return {
        status: 401,
        message: 'Missing or invalid Authorization header',
        details: 'Expected: Authorization: Bearer <license-token>'
      };
    }

    const validation = this.validateToken(bearerToken);
    
    if (validation.error?.includes('expired')) {
      return {
        status: 401,
        message: 'License has expired',
        details: validation.error
      };
    }

    if (validation.error?.includes('signature')) {
      return {
        status: 401,
        message: 'Invalid license signature',
        details: 'License token signature verification failed'
      };
    }

    return {
      status: 401,
      message: 'Invalid license token',
      details: validation.error || 'License validation failed'
    };
  }

  /**
   * Checks if the current customer has access to organization-scoped resources
   * @param authenticatedUser The authenticated customer
   * @param organizationId The organization ID being accessed
   * @returns true if access is allowed
   */
  public hasOrganizationAccess(authenticatedUser: AuthenticatedUser, organizationId?: string): boolean {
    // In single-tenant deployment, each customer has access to their own organization data
    // This can be extended for multi-tenant scenarios if needed
    
    if (!organizationId) {
      return true; // Allow access to general resources
    }

    // For now, allow access since each customer has their own proxy instance
    // In a multi-tenant scenario, you would check customer-to-organization mapping here
    return true;
  }

  /**
   * Gets customer-specific configuration overrides
   * @param authenticatedUser The authenticated customer
   * @returns Configuration overrides for this customer
   */
  public getCustomerConfig(authenticatedUser: AuthenticatedUser): { apiUrl: string; customerId: string } {
    return {
      apiUrl: authenticatedUser.unsignedData.apiUrl,
      customerId: authenticatedUser.customerId
    };
  }
}
