import { Router } from "express";
import { Request, Response } from "express";
import {
  getAllAvales,
  getAvalById,
  createAval,
  updateAval,
  deleteAval,
} from "./controller";
import { authMiddleware } from "../../middleware/authMiddleware";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import {
  validateBody,
  validateMultiple,
  basicSanitization,
} from "../../middleware/zodValidation";
import { AvalCreateSchema, AvalUpdateSchema } from "../../types/avales";

const router = Router();

// Rutas públicas
router.get("/", getAllAvales);
router.get("/:id", getAvalById);

// Rutas protegidas (requieren autenticación)
router.post(
  "/",
  authMiddleware,
  basicSanitization,
  validateBody(AvalCreateSchema),
  (req: Request, res: Response) => createAval(req as AuthenticatedRequest, res)
);

router.put(
  "/:id",
  authMiddleware,
  basicSanitization,
  validateMultiple({
    body: AvalUpdateSchema,
  }),
  (req: Request, res: Response) => updateAval(req as AuthenticatedRequest, res)
);

router.delete("/:id", authMiddleware, (req: Request, res: Response) =>
  deleteAval(req as AuthenticatedRequest, res)
);

export default router;
