import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { getUserProfile } from './controller';

const router = Router();

router.get('/me', authMiddleware, getUserProfile);

export default router;
