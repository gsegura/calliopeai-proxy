import { Router } from 'express';
import { searchWeb } from '../controllers/webController';
import {authenticateBearerToken} from '../middleware/auth';
import { crawlWebsite } from '../controllers/crawlController';
import authRoutes from './authRoutes';

const router = Router();

// Mount auth routes (includes public endpoints)
router.use('/auth', authRoutes);

// Legacy routes using token-based auth
router.use(authenticateBearerToken);

router.post('/web', searchWeb);
router.post('/crawl', crawlWebsite);

export default router;
