import express, { Request, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../../middleware/authMiddleware";
import {
  createExamenRealizado,
  getExamenesRealizadosByUsuarioYFormacion,
  getExamenRealizadoById,
  getUltimoIntento,
} from "./controller";

const router = express.Router();

// Rutas públicas (lectura)
router.get("/usuario/:idUsuario/formacion/:idFormacion", getExamenesRealizadosByUsuarioYFormacion);
router.get("/usuario/:idUsuario/formacion/:idFormacion/ultimo", getUltimoIntento);
router.get("/:id", getExamenRealizadoById);

// Rutas protegidas (creación)
router.post(
  "/",
  authMiddleware,
  (req: Request, res: Response) => createExamenRealizado(req as AuthenticatedRequest, res)
);

export default router;

