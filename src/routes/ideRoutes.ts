import { Router } from 'express';
import { IdeController } from '../controllers/ideController';
import { authenticateBearerToken } from '../middleware/auth';

const router = Router();
const ideController = new IdeController();

// All IDE routes require Bearer token authentication
router.use(authenticateBearerToken);

// Secret resolution endpoint
router.post('/sync-secrets', ideController.syncSecrets);

// Assistant management endpoints
router.get('/list-assistants', ideController.listAssistants);
router.get('/list-assistant-full-slugs', ideController.listAssistantFullSlugs);

// Organization management endpoint
router.get('/list-organizations', ideController.listOrganizations);

// Free trial management endpoints
router.get('/free-trial-status', ideController.getFreeTrialStatus);
router.post('/update-free-trial-usage', ideController.updateFreeTrialUsage);

// Health check endpoint
router.get('/health', ideController.health);

export default router;
