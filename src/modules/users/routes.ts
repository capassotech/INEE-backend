import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { getUser, getUsers, getUserProfile, deleteUser, updateUser, addMembershipToUser, asignCourseToUser } from './controller';

const router = Router();

router.get('/me', authMiddleware, getUserProfile);

router.post('/add-membership', addMembershipToUser);

router.get('/:id', getUser);

router.get('/', getUsers);

router.delete('/:id', deleteUser);

router.put('/:id', updateUser);

router.post('/:id/asignar-curso', asignCourseToUser);

export default router;
