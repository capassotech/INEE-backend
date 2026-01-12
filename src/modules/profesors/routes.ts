import { Router } from "express";
import { getProfesors, getProfesorById, createProfesor, updateProfesor, deleteProfesor } from "./controller";
import { authMiddleware } from "../../middleware/authMiddleware";

const router = Router();

// Middleware de debug
router.use((req, res, next) => {
  next();
});

// Rutas públicas
router.get('/', getProfesors);
router.get('/:id', getProfesorById);

// Rutas protegidas
router.post('/', authMiddleware, createProfesor);
router.put('/:id', authMiddleware, updateProfesor);
router.delete('/:id', authMiddleware, deleteProfesor);

export default router;