import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
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
  desasignarEbookFromUser,
  uploadProfilePhoto 
} from './controller';

const profilePhotoMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (JPEG, PNG, GIF o WebP)'));
    }
  },
});

const profilePhotoUpload = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  profilePhotoMulter.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ])(req, res, (err: unknown) => {
    if (!err) {
      return next();
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'El archivo supera el tamaño máximo (5 MB)' });
      }
      return res.status(400).json({ error: err.message });
    }
    const message = err instanceof Error ? err.message : 'Error al procesar el archivo';
    return res.status(400).json({ error: message });
  });
};

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
router.put('/:id/profile-photo', authMiddleware, profilePhotoUpload, uploadProfilePhoto);

router.post('/:id/asignar-curso', asignCourseToUser);
router.post('/:id/desasignar-curso', desasignarCursoFromUser);

router.post('/:id/asignar-evento', asignarEventoToUser);
router.post('/:id/desasignar-evento', desasignarEventoFromUser);

router.post('/:id/asignar-ebook', asignarEbookToUser);
router.post('/:id/desasignar-ebook', desasignarEbookFromUser);

export default router;
