import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { getUser, getUsers, getUserProfile, deleteUser, updateUser, addMembershipToUser, asignCourseToUser, desasignarCursoFromUser, createUser } from './controller';

const router = Router();

// Middleware de debug para todas las rutas
router.use((req, res, next) => {
  console.log(`🔍 [USERS] ${req.method} ${req.path}`);
  next();
});

router.get('/me', authMiddleware, getUserProfile);

router.post('/add-membership', addMembershipToUser);

// IMPORTANTE: Las rutas específicas deben ir ANTES de las rutas con parámetros
router.post('/', authMiddleware, createUser);
router.get('/', getUsers);

router.get('/:id', getUser);

router.delete('/:id', deleteUser);

router.put('/:id', updateUser);

router.post('/:id/asignar-curso', asignCourseToUser);
router.post('/:id/desasignar-curso', desasignarCursoFromUser);

export default router;
