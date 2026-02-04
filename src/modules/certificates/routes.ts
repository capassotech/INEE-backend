import { Router, Request, Response } from 'express';
import {
  generarCertificado,
  validarCertificado,
  obtenerPdfCertificado,
} from './controller';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/authMiddleware';
import { validateMultiple } from '../../middleware/zodValidation';
import {
  GenerarCertificadoSchema,
} from '../../types/certificates';

const router = Router();

// Generar certificado (requiere autenticación)
router.post(
  '/generar/:cursoId',
  authMiddleware,
  (req: Request, res: Response) => generarCertificado(req as AuthenticatedRequest, res)
);

// Validar certificado (público, no requiere autenticación)
router.get(
  '/validar/:certificadoId',
  validarCertificado
);

// Obtener PDF del certificado (público, no requiere autenticación)
router.get(
  '/pdf/:certificadoId',
  obtenerPdfCertificado
);

export default router;



