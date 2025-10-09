import { Router } from "express";
import { getProfesors, getProfesorById } from "./controller";



const router = Router();

router.get('/', getProfesors);
router.get('/:id', getProfesorById);

export default router;