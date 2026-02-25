import { Router } from "express";
import { Request, Response } from "express";
import {
  getAllRecomendaciones,
  getRecomendacionById,
  createRecomendacion,
  updateRecomendacion,
  deleteRecomendacion,
} from "./controller";
import { authMiddleware } from "../../middleware/authMiddleware";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import {
  validateBody,
  validateMultiple,
  basicSanitization,
} from "../../middleware/zodValidation";
import { RecomendacionCreateSchema, RecomendacionUpdateSchema } from "../../types/recomendaciones";

const router = Router();

// Rutas públicas
router.get("/", getAllRecomendaciones);
router.get("/:id", getRecomendacionById);

// Rutas protegidas (requieren autenticación)
router.post(
  "/",
  authMiddleware,
  basicSanitization,
  validateBody(RecomendacionCreateSchema),
  (req: Request, res: Response) => createRecomendacion(req as AuthenticatedRequest, res)
);

router.put(
  "/:id",
  authMiddleware,
  basicSanitization,
  validateMultiple({
    body: RecomendacionUpdateSchema,
  }),
  (req: Request, res: Response) => updateRecomendacion(req as AuthenticatedRequest, res)
);

router.delete("/:id", authMiddleware, (req: Request, res: Response) =>
  deleteRecomendacion(req as AuthenticatedRequest, res)
);

export default router;
