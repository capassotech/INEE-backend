import { Router } from "express";
import { getPreguntaById, testVocacional, sendPartialResponse } from "./controller";


const router = Router();

router.get('/preguntas/:id', getPreguntaById);

router.post('/', testVocacional);

router.post('/enviar-respuesta-parcial/:uid', sendPartialResponse);

export default router;