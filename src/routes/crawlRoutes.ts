import { Router } from 'express';
import { crawlWebsite } from '../controllers/crawlController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/crawl', authenticateToken, crawlWebsite);

export default router;
