import { Router } from "express";
import { Request, Response } from "express";
import {
  getAllMercadoPagoAccounts,
  createMercadoPagoAccount,
  updateMercadoPagoAccount,
  deleteMercadoPagoAccount,
} from "./controller";
import { authMiddleware } from "../../middleware/authMiddleware";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import {
  basicSanitization,
  validateBody,
  validateMultiple,
} from "../../middleware/zodValidation";
import {
  MercadoPagoAccountCreateSchema,
  MercadoPagoAccountUpdateSchema,
} from "../../types/mercado-pago-accounts";

const router = Router();

// Todas las rutas requieren autenticación de administrador
router.get(
  "/",
  authMiddleware,
  (req: Request, res: Response) =>
    getAllMercadoPagoAccounts(req as AuthenticatedRequest, res)
);

router.post(
  "/",
  authMiddleware,
  basicSanitization,
  validateBody(MercadoPagoAccountCreateSchema),
  (req: Request, res: Response) =>
    createMercadoPagoAccount(req as AuthenticatedRequest, res)
);

router.put(
  "/:id",
  authMiddleware,
  basicSanitization,
  validateMultiple({
    body: MercadoPagoAccountUpdateSchema,
  }),
  (req: Request, res: Response) =>
    updateMercadoPagoAccount(req as AuthenticatedRequest, res)
);

router.delete(
  "/:id",
  authMiddleware,
  (req: Request, res: Response) =>
    deleteMercadoPagoAccount(req as AuthenticatedRequest, res)
);

export default router;
