import { Router } from 'express';
import {
  proxyChatCompletions,
  proxyCompletions,
  proxyEmbeddings,
  proxyRerank,
} from '../controllers/modelProxyController';
import { authenticateBearerToken } from '../middleware/auth';

const router = Router();

// All routes under /model-proxy/v1 will use Bearer token authentication
router.use(authenticateBearerToken);

router.post('/chat/completions', proxyChatCompletions);
router.post('/completions', proxyCompletions);
router.post('/embeddings', proxyEmbeddings);
router.post('/rerank', proxyRerank);

export default router;
