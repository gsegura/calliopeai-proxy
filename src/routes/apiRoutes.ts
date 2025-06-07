import { Router } from 'express';
import { searchWeb } from '../controllers/webController';
import {authenticateBearerToken, authenticateToken} from '../middleware/auth';
import { crawlWebsite } from '../controllers/crawlController';

const router = Router();

router.use(authenticateToken);

router.post('/web', searchWeb);
router.post('/crawl', crawlWebsite);

export default router;
