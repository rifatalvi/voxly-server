import { Router } from 'express';
import { getCallHistory, generateTurnCredentials } from '../controllers/call.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/history', getCallHistory);
router.get('/turn-credentials', generateTurnCredentials);

export default router;
