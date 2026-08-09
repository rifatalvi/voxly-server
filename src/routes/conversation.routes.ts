import { Router } from 'express';
import { 
  getOrCreateConversation, 
  listConversations, 
  getMessages,
  createConversationSchema 
} from '../controllers/conversation.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';

const router = Router();

router.use(authenticate);

router.post('/', validate(createConversationSchema), getOrCreateConversation);
router.get('/', listConversations);
router.get('/:id/messages', getMessages);

export default router;
