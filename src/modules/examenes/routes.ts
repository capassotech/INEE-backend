import { Router, Request, Response } from "express";
import {
  getAllExamenes,
  getExamenById,
  createExamen,
  updateExamen,
  deleteExamen,
  getExamenesByFormacion,
} from "./controller";
import { authMiddleware, AuthenticatedRequest } from "../../middleware/authMiddleware";

const router = Router();

// Rutas públicas (lectura)
router.get("/", getAllExamenes);
router.get("/:id", getExamenById);
router.get("/formacion/:id_formacion", getExamenesByFormacion);

// Rutas protegidas (requieren autenticación)
router.post("/", authMiddleware, (req: Request, res: Response) =>
  createExamen(req as AuthenticatedRequest, res)
);

router.put("/:id", authMiddleware, (req: Request, res: Response) =>
  updateExamen(req as AuthenticatedRequest, res)
);

router.delete("/:id", authMiddleware, (req: Request, res: Response) =>
  deleteExamen(req as AuthenticatedRequest, res)
);

export default router;

