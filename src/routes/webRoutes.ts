import { Router } from 'express';
import { searchWeb } from '../controllers/webController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/web', authenticateToken, searchWeb);

export default router;
