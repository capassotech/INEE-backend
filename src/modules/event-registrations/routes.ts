import { Router, Request, Response } from 'express';
import {
  verificarDisponibilidad,
  inscribirseEvento,
  comprarEInscribirse,
  webhookPagoEvento,
  listarMisInscripciones,
  verificarInscripcion,
  cancelarInscripcion,
} from './controller';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/authMiddleware';
import { validateMultiple } from '../../middleware/zodValidation';
import { InscribirseEventoSchema } from '../../types/event-registrations';

const router = Router();

// Verificar disponibilidad de inscripción (requiere autenticación)
router.get(
  '/disponibilidad/:eventoId',
  authMiddleware,
  (req: Request, res: Response) => verificarDisponibilidad(req as AuthenticatedRequest, res)
);

// Inscribirse a un evento (requiere autenticación)
router.post(
  '/inscribirse',
  authMiddleware,
  validateMultiple({
    body: InscribirseEventoSchema,
  }),
  (req: Request, res: Response) => inscribirseEvento(req as AuthenticatedRequest, res)
);

// Webhook para procesar pago y crear inscripción automáticamente (sin autenticación, viene de Mercado Pago)
router.post(
  '/webhook-pago',
  webhookPagoEvento
);

// Comprar e inscribirse (después del pago) (requiere autenticación)
router.post(
  '/comprar-e-inscribirse',
  authMiddleware,
  (req: Request, res: Response) => comprarEInscribirse(req as AuthenticatedRequest, res)
);

// Listar inscripciones del usuario (requiere autenticación)
router.get(
  '/mis-inscripciones',
  authMiddleware,
  (req: Request, res: Response) => listarMisInscripciones(req as AuthenticatedRequest, res)
);

// Verificar si está inscrito a un evento (requiere autenticación)
router.get(
  '/verificar/:eventoId',
  authMiddleware,
  (req: Request, res: Response) => verificarInscripcion(req as AuthenticatedRequest, res)
);

// Cancelar inscripción (requiere autenticación)
router.delete(
  '/:inscripcionId',
  authMiddleware,
  (req: Request, res: Response) => cancelarInscripcion(req as AuthenticatedRequest, res)
);

export default router;
