import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { getUser, getUsers, getUserProfile, deleteUser, updateUser, addMembershipToUser } from './controller';

const router = Router();

router.get('/me', authMiddleware, getUserProfile);

router.post('/add-membership', addMembershipToUser);

router.get('/:id', getUser);

router.get('/', getUsers);

router.delete('/:id', deleteUser);

router.put('/:id', updateUser);

export default router;
