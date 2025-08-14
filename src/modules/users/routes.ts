import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { getUser, getUsers, getUserProfile } from './controller';

const router = Router();

router.get('/me', authMiddleware, getUserProfile);

router.get('/:id', getUser);
router.get('/', getUsers);

export default router;
