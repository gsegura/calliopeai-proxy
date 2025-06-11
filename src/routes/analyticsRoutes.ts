import { Router } from 'express';
import { captureAnalytics } from '../controllers/analyticsController';
import { authenticateBearerToken } from '../middleware/auth';

const router = Router();

// All analytics routes use Bearer token authentication
router.use(authenticateBearerToken);

// POST /proxy/analytics/{workspaceId}/capture
router.post('/analytics/:workspaceId/capture', captureAnalytics);

export default router;
