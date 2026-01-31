import { Router, Request, Response } from 'express';
import {
  marcarCompletado,
  desmarcarCompletado,
  obtenerProgresoCurso,
  obtenerEstadoContenido,
  listarMisCursos,
} from './controller';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/authMiddleware';
import { validateMultiple } from '../../middleware/zodValidation';
import {
  MarcarCompletadoSchema,
  DesmarcarCompletadoSchema,
} from '../../types/progress';

const router = Router();

// Marcar contenido como completado
router.post(
  '/marcar-completado',
  validateMultiple({
    body: MarcarCompletadoSchema,
  }),
  marcarCompletado
);

// Desmarcar contenido como completado
router.post(
  '/desmarcar-completado',
  validateMultiple({
    body: DesmarcarCompletadoSchema,
  }),
  desmarcarCompletado
);

// Obtener progreso de un curso (requiere autenticación)
router.get(
  '/curso/:cursoId',
  authMiddleware,
  (req: Request, res: Response) => obtenerProgresoCurso(req as AuthenticatedRequest, res)
);

// Obtener estado de un contenido específico (requiere autenticación)
router.get(
  '/contenido/:moduloId/:contenidoId',
  authMiddleware,
  (req: Request, res: Response) => obtenerEstadoContenido(req as AuthenticatedRequest, res)
);

// Listar formaciones del usuario con progreso (requiere autenticación)
router.get(
  '/mis-cursos',
  authMiddleware,
  (req: Request, res: Response) => listarMisCursos(req as AuthenticatedRequest, res)
);

export default router;

