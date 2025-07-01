import { Router } from 'express';
import { IdeController } from '../controllers/ideController';
import { authenticateBearerToken } from '../middleware/auth';
import { 
  logAuthenticationEvents, 
  checkLicenseExpiration, 
  validateOrganizationAccess,
  validateRequestLimits 
} from '../middleware/security';

const router = Router();
const ideController = new IdeController();

// All IDE routes require Bearer token authentication
router.use(authenticateBearerToken);
router.use(logAuthenticationEvents);
router.use(checkLicenseExpiration);
router.use(validateRequestLimits);

// Secret resolution endpoint
router.post('/sync-secrets', ideController.syncSecrets);

// Assistant management endpoints
router.get('/list-assistants', ideController.listAssistants);
router.get('/list-assistant-full-slugs', ideController.listAssistantFullSlugs);

// Organization management endpoint (requires organization access validation)
router.get('/list-organizations', validateOrganizationAccess, ideController.listOrganizations);

// Free trial management endpoints
router.get('/free-trial-status', ideController.getFreeTrialStatus);
router.post('/update-free-trial-usage', ideController.updateFreeTrialUsage);

// Health check endpoint
router.get('/health', ideController.health);

export default router;
