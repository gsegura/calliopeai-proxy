/**
 * License-related interfaces for Calliope authentication system
 */

export interface LicenseData {
  customerId: string;
  createdAt: string; // ISO timestamp
  expiresAt: string; // ISO timestamp
}

export interface UnsignedLicenseData {
  apiUrl: string;
}

export interface LicensePayload {
  data: string; // JSON string of LicenseData
  signature: string; // RSA signature in base64
  unsignedData: UnsignedLicenseData;
}

export interface ValidatedLicense {
  isValid: boolean;
  error?: string;
  licenseData?: LicenseData;
  unsignedData?: UnsignedLicenseData;
  expirationDate?: Date;
  daysUntilExpiry?: number;
}

export interface AuthenticatedUser {
  customerId: string;
  apiUrl: string;
  licenseData: LicenseData;
  unsignedData: UnsignedLicenseData;
}
