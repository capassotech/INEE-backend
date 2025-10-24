import { Router } from "express";
import { getPreguntaById, testVocacional, sendPartialResponse, getAllPreguntas, getRespuestaById, getAllRespuestas } from "./controller";


const router = Router();

router.get('/preguntas/:id', getPreguntaById);

router.get('/preguntas', getAllPreguntas);

router.get('/respuestas/:id', getRespuestaById);

router.get('/respuestas', getAllRespuestas);

router.post('/', testVocacional);

router.post('/enviar-respuesta-parcial/:uid', sendPartialResponse);

export default router;