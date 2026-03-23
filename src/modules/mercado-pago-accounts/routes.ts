import { Router } from "express";
import { Request, Response } from "express";
import {
  getAllMercadoPagoAccounts,
  updateMercadoPagoAccountActivo,
} from "./controller";
import { authMiddleware } from "../../middleware/authMiddleware";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { basicSanitization, validateBody } from "../../middleware/zodValidation";
import { MercadoPagoAccountUpdateActivoSchema } from "../../types/mercado-pago-accounts";

const router = Router();

// Todas las rutas requieren autenticación de administrador
router.get(
  "/",
  authMiddleware,
  (req: Request, res: Response) =>
    getAllMercadoPagoAccounts(req as AuthenticatedRequest, res)
);

router.put(
  "/:id",
  authMiddleware,
  basicSanitization,
  validateBody(MercadoPagoAccountUpdateActivoSchema),
  (req: Request, res: Response) =>
    updateMercadoPagoAccountActivo(req as AuthenticatedRequest, res)
);

export default router;
