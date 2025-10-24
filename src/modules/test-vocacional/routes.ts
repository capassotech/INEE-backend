import { Router } from "express";
import { 
    getPreguntaById, 
    testVocacional, 
    sendPartialResponse, 
    getAllPreguntas, 
    getRespuestaById, 
    getAllRespuestas, 
    getPerfiles, 
    createPregunta,
} from "./controller";


const router = Router();

router.get('/preguntas/:id', getPreguntaById);

router.get('/preguntas', getAllPreguntas);

router.post('/preguntas', createPregunta);

router.get('/respuestas/:id', getRespuestaById);

router.get('/respuestas', getAllRespuestas);

router.post('/', testVocacional);

router.post('/enviar-respuesta-parcial/:uid', sendPartialResponse);

router.get('/perfiles', getPerfiles);

export default router;