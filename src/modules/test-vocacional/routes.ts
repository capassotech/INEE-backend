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
    updatePregunta,
    updateRespuesta,
    createPerfil,
    updatePerfil,
    deletePerfil,
    getPerfilById,
    deletePregunta,
} from "./controller";


const router = Router();

router.get('/preguntas/:id', getPreguntaById);

router.get('/preguntas', getAllPreguntas);

router.post('/preguntas', createPregunta);

router.put('/preguntas/:id', updatePregunta);

router.delete('/preguntas/:id', deletePregunta);

router.get('/respuestas/:id', getRespuestaById);

router.get('/respuestas', getAllRespuestas);

router.put('/respuestas/:id', updateRespuesta);

router.post('/', testVocacional);

router.post('/enviar-respuesta-parcial/:uid', sendPartialResponse);

router.get('/perfiles', getPerfiles);

router.get('/perfiles/:id', getPerfilById);

router.post('/perfiles', createPerfil);

router.put('/perfiles/:id', updatePerfil);

router.delete('/perfiles/:id', deletePerfil);

export default router;