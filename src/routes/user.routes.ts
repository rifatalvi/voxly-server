import { Router } from 'express';
import { getProfile, updateProfile, searchUsers, updateProfileSchema } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';

const router = Router();

router.use(authenticate);

router.get('/profile', getProfile);
router.put('/profile', validate(updateProfileSchema), updateProfile);
router.get('/search', searchUsers);

export default router;
