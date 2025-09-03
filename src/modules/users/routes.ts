import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { getUser, getUsers, getUserProfile, deleteUser, updateUser } from './controller';

const router = Router();

router.get('/me', authMiddleware, getUserProfile);

router.get('/:id', getUser);

router.get('/', getUsers);

router.delete('/:id', deleteUser);

router.put('/:id', updateUser);

export default router;
