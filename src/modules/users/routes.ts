import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { 
  getUser, 
  getUsers, 
  getUserProfile, 
  deleteUser, 
  updateUser, 
  /* addMembershipToUser, */ 
  asignCourseToUser, 
  desasignarCursoFromUser, 
  createUser, 
  asignarEventoToUser, 
  desasignarEventoFromUser, 
  asignarEbookToUser, 
  desasignarEbookFromUser 
} from './controller';

const router = Router();

// Middleware de debug para todas las rutas
router.use((req, res, next) => {
  next();
});

router.get('/me', authMiddleware, getUserProfile);

// MEMBRESÍAS DESACTIVADAS - Comentado para posible reactivación futura
// router.post('/add-membership', addMembershipToUser);

// IMPORTANTE: Las rutas específicas deben ir ANTES de las rutas con parámetros
router.post('/', authMiddleware, createUser);
router.get('/', getUsers);

router.get('/:id', getUser);

router.delete('/:id', deleteUser);

router.put('/:id', updateUser);

router.post('/:id/asignar-curso', asignCourseToUser);
router.post('/:id/desasignar-curso', desasignarCursoFromUser);

router.post('/:id/asignar-evento', asignarEventoToUser);
router.post('/:id/desasignar-evento', desasignarEventoFromUser);

router.post('/:id/asignar-ebook', asignarEbookToUser);
router.post('/:id/desasignar-ebook', desasignarEbookFromUser);

export default router;
