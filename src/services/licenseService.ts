import * as crypto from 'crypto';
import { LicensePayload, LicenseData, ValidatedLicense } from '../interfaces/license';

 /* 
 * This service validates RSA-signed license tokens for customer authentication.
 * Each customer receives a unique license token that contains their customer ID,
 * expiration date, and API URL configuration.
 */
export class LicenseService {
  private static instance: LicenseService;
  private publicKey: string;

  private constructor() {
    // Load the public key from environment variable or embedded constant
    this.publicKey = this.loadPublicKey();
  }

  public static getInstance(): LicenseService {
    if (!LicenseService.instance) {
      LicenseService.instance = new LicenseService();
    }
    return LicenseService.instance;
  }

  /**
   * Validates a Calliope license token
   * @param licenseToken Base64-encoded license token
   * @returns Validation result with license data if valid
   */
  public validateLicense(licenseToken: string): ValidatedLicense {
    try {
      // Decode the base64 license token
      const decodedString = Buffer.from(licenseToken, 'base64').toString('utf8');
      const licensePayload: LicensePayload = JSON.parse(decodedString);

      // Verify required fields exist
      if (!licensePayload.data || !licensePayload.signature || !licensePayload.unsignedData) {
        return { isValid: false, error: 'Invalid license format: missing required fields' };
      }

      // Verify the RSA signature
      const verify = crypto.createVerify('SHA256');
      verify.update(licensePayload.data);
      verify.end();

      const isValidSignature = verify.verify(this.publicKey, licensePayload.signature, 'base64');

      if (!isValidSignature) {
        return { isValid: false, error: 'Invalid license signature' };
      }

      // Parse the signed license data
      const licenseData: LicenseData = JSON.parse(licensePayload.data);

      // Validate required license data fields
      if (!licenseData.customerId || !licenseData.expiresAt || !licenseData.createdAt) {
        return { isValid: false, error: 'Invalid license data: missing required fields' };
      }

      // Check license expiration
      const expirationDate = new Date(licenseData.expiresAt);
      const now = new Date();
      
      if (isNaN(expirationDate.getTime())) {
        return { isValid: false, error: 'Invalid license expiration date format' };
      }

      const isNotExpired = expirationDate > now;

      if (!isNotExpired) {
        const daysUntilExpiry = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          isValid: false,
          error: 'License has expired',
          licenseData,
          unsignedData: licensePayload.unsignedData,
          expirationDate,
          daysUntilExpiry
        };
      }

      // Calculate days until expiry for monitoring
      const daysUntilExpiry = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      return {
        isValid: true,
        licenseData,
        unsignedData: licensePayload.unsignedData,
        expirationDate,
        daysUntilExpiry
      };

    } catch (error) {
      console.error('License validation error:', error);
      return {
        isValid: false,
        error: `License validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Loads the public key for license validation from environment variables
   * This ensures keys are managed securely through Docker Compose
   */
  private loadPublicKey(): string {
    const envPublicKey = process.env.CALLIOPE_PUBLIC_KEY;
    
    if (!envPublicKey) {
      throw new Error(
        'CALLIOPE_PUBLIC_KEY environment variable is required. ' +
        'Please set this in your Docker Compose environment configuration.'
      );
    }

    // Validate that it looks like a PEM public key
    if (!envPublicKey.includes('BEGIN PUBLIC KEY') || !envPublicKey.includes('END PUBLIC KEY')) {
      throw new Error(
        'CALLIOPE_PUBLIC_KEY must be a valid PEM format public key. ' +
        'Generate one using the keys/generate-keypair.js script.'
      );
    }

    return envPublicKey;
  }

  /**
   * Gets license information for logging/monitoring purposes
   * @param licenseToken Base64-encoded license token
   * @returns License information without sensitive data
   */
  public getLicenseInfo(licenseToken: string): { customerId?: string; expiresAt?: string; daysUntilExpiry?: number } {
    const validation = this.validateLicense(licenseToken);
    if (validation.isValid && validation.licenseData) {
      return {
        customerId: validation.licenseData.customerId,
        expiresAt: validation.licenseData.expiresAt,
        daysUntilExpiry: validation.daysUntilExpiry
      };
    }
    return {};
  }
}
