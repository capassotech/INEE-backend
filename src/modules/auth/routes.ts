import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { verifyUser } from './controller';

const router = Router();

router.get('/verify', authMiddleware, verifyUser);

export default router;