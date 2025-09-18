import { Router } from "express";
import { getPreguntaById, getQuestions, getRespuestaById, getRespuestas, testVocacional } from "./controller";


const router = Router();

router.get('/preguntas', getQuestions);
router.get('/preguntas/:id', getPreguntaById);

router.get('/respuestas', getRespuestas);
router.get('/respuestas/:id', getRespuestaById);

router.post('/', testVocacional);

export default router;