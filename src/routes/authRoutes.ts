import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticateBearerToken } from '../middleware/auth';
import { logAuthenticationEvents, checkLicenseExpiration } from '../middleware/security';

const router = Router();
const authController = new AuthController();

// Public endpoints (no authentication required)
router.post('/validate-token', authController.validateToken);

// Health check endpoint (can work with or without authentication)
// This endpoint will try to validate the token if provided, but won't fail if missing
router.get('/health', authController.health);

// Protected endpoints requiring valid license
router.use(authenticateBearerToken);
router.use(logAuthenticationEvents);
router.use(checkLicenseExpiration);

// License information for authenticated customers (requires valid Bearer token)
router.get('/license-info', authController.licenseInfo);

export default router;
