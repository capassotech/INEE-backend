import { firestore } from "../../config/firebase";
import { Request, Response } from "express";



export const getPreguntaById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const pregunta = await firestore.collection('preguntas').doc(id).get();

        if (!pregunta.exists) {
            return res.status(404).json({ error: 'Pregunta no encontrada' });
        }

        const idRespuestas = pregunta.data()?.id_respuestas || [];
        
        if (idRespuestas.length === 0) {
            return res.json({
                ...pregunta.data(),
                respuestas: []
            });
        }

        // ✅ OPTIMIZACIÓN: Batch read con getAll() para evitar N+1 queries
        // Firestore Admin SDK permite leer múltiples documentos en una sola operación
        const BATCH_SIZE = 10; // Firestore getAll() tiene límite de 10 documentos
        const batches = [];
        
        for (let i = 0; i < idRespuestas.length; i += BATCH_SIZE) {
            const batch = idRespuestas.slice(i, i + BATCH_SIZE);
            const refs = batch.map((respuestaId: string) => 
                firestore.collection('respuestas').doc(respuestaId)
            );
            batches.push(firestore.getAll(...refs));
        }
        
        const allDocs = await Promise.all(batches);
        const respuestas = allDocs
            .flat()
            .filter(doc => doc.exists) // Filtrar documentos que no existen
            .map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

        return res.json({
            id: pregunta.id,
            ...pregunta.data(),
            respuestas: respuestas
        });
    } catch (error) {
        console.error('getPreguntaById error:', error);
        return res.status(500).json({ error: 'Error al obtener pregunta' });
    }
}

export const testVocacional = async (req: any, res: Response) => {
    const { uid, responses }: { uid: string, responses: string[] } = req.body;
    if (!uid || !responses) {
        return res.status(400).json({ error: 'Datos inválidos' });
    }

    if (responses.length > 5) {
        return res.status(400).json({ error: 'Cantidad de respuestas inválida' });
    }

    const userDoc = await firestore.collection('users').doc(uid).get();
    if (!userDoc.exists) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    let counterA = 0;
    let counterB = 0;
    let counterC = 0;
    for (const response of responses) {
        if (response.toLowerCase() === 'a') counterA++;
        else if (response.toLowerCase() === 'b') counterB++;
        else if (response.toLowerCase() === 'c') counterC++;
    }

    let rutaAprendizaje: string;
    if (counterA > counterB && counterA > counterC) rutaAprendizaje = 'consultoria';
    else if (counterB > counterA && counterB > counterC) rutaAprendizaje = 'liderazgo';
    else if (counterC > counterA && counterC > counterB) rutaAprendizaje = 'emprendimiento';
    else if (counterA === counterB) rutaAprendizaje = 'consultor-lider';
    else if (counterB === counterC) rutaAprendizaje = 'lider-emprendedor';
    else if (counterC === counterA) rutaAprendizaje = 'emprendedor-consultor';
    else rutaAprendizaje = 'consultoria';

    await userDoc.ref.update({ ruta_aprendizaje: rutaAprendizaje });

    const ruta = await firestore.collection('rutas_aprendizaje').doc(rutaAprendizaje).get();

    return res.status(200).json({
        success: true,
        ruta: {
            id: ruta.id,
            ...ruta.data()
        }
    });
}

export const sendPartialResponse = async (req: Request, res: Response) => {
    const { uid } = req.params;
    const { id_pregunta, letra_respuesta } = req.body;
    
    if (!uid || !id_pregunta || !letra_respuesta) {
        return res.status(400).json({ error: 'Datos inválidos' });
    }

    const getResponseId = (questionId: string, answerLetter: string): string => {
        const questionNumber = parseInt(questionId.replace('p', ''));
        
        const letterOffset = answerLetter.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);
        
        const responseId = (questionNumber - 1) * 3 + letterOffset + 1;
        
        return `r${responseId}`;
    };

    const id_respuesta = getResponseId(id_pregunta, letra_respuesta);
    
    const userRef = await firestore.collection('users').doc(uid).get();
    const userData = userRef.data();
    
    const currentResponses = userData?.respuestas_test_vocacional || [];
    
    const existingResponseIndex = currentResponses.findIndex(
        (response: any) => response.id_pregunta === id_pregunta
    );
    
    if (existingResponseIndex !== -1) {
        currentResponses[existingResponseIndex].id_respuesta = id_respuesta;
    } else {
        currentResponses.push({
            id_pregunta,
            id_respuesta
        });
    }
    
    await firestore.collection('users').doc(uid).update({
        respuestas_test_vocacional: currentResponses
    });

    return res.status(200).json({ 
        success: true, 
        id_pregunta, 
        letra_respuesta, 
        id_respuesta 
    });
}

export const getAllPreguntas = async (req: Request, res: Response) => {
    try {
        const preguntas = await firestore.collection('preguntas').get();
        return res.json(preguntas.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
        console.error('getAllPreguntas error:', error);
        return res.status(500).json({ error: 'Error al obtener preguntas' });
    }
}

export const createPregunta = async (req: Request, res: Response) => {
    const { texto, respuestas } = req.body;
    try {
        const preguntasSnapshot = await firestore.collection('preguntas').get();
        
        let nextId = 'p1';
        
        if (!preguntasSnapshot.empty) {
            const ids = preguntasSnapshot.docs.map(doc => doc.id);
            const numericIds = ids
                .filter(id => id.startsWith('p'))
                .map(id => parseInt(id.substring(1)))
                .filter(num => !isNaN(num));
            
            if (numericIds.length > 0) {
                const maxId = Math.max(...numericIds);
                nextId = `p${maxId + 1}`;
            }
        }

        const id_respuestas = [];

        for (const respuesta of respuestas) {
            const newRespuesta = await createRespuesta(nextId, respuesta);
            id_respuestas.push(newRespuesta.nextId);
        }

        await firestore.collection('preguntas').doc(nextId).set({
            texto,
            id_respuestas,
            orden: nextId.replace('p', '')
        });
        
        return res.json({ 
            id: nextId,
            texto, 
            respuestas 
        });
    } catch (error) {
        console.error('createPregunta error:', error);
        return res.status(500).json({ error: 'Error al crear pregunta' });
    }
}

export const updatePregunta = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { texto } = req.body;

    try {
        await firestore.collection('preguntas').doc(id).update({ texto });
        return res.json({ success: true });
    }
    catch (error) {
        console.error('updatePregunta error:', error);
        return res.status(500).json({ error: 'Error al actualizar pregunta' });
    }
}

export const deletePregunta = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await firestore.collection('preguntas').doc(id).delete();
        return res.json({ success: true });
    } catch (error) {
        console.error('deletePregunta error:', error);
        return res.status(500).json({ error: 'Error al eliminar pregunta' });
    }
}

export const getRespuestaById = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const respuesta = await firestore.collection('respuestas').doc(id).get();
        return res.json(respuesta.data());
    } catch (error) {
        console.error('getRespuestaById error:', error);
        return res.status(500).json({ error: 'Error al obtener respuesta' });
    }
}

export const createRespuestaEndpoint = async (req: Request, res: Response) => {
    const { id_pregunta, respuesta } = req.body;
    try {
        await createRespuesta(id_pregunta, respuesta);
        return res.json({ success: true });
    } catch (error) {
        console.error('createRespuestaEndpoint error:', error);
        return res.status(500).json({ error: 'Error al crear respuesta' });
    }
}

export const createRespuesta = async (id_pregunta: string, respuesta: { letra: string, texto: string }) => {
    try {
        const respuestasSnapshot = await firestore.collection('respuestas').get();
        let nextId = 'r1';
        if (!respuestasSnapshot.empty) {
                const ids = respuestasSnapshot.docs.map(doc => doc.id);
                const numericIds = ids
                    .filter(id => id.startsWith('r'))
                    .map(id => parseInt(id.substring(1)))
                    .filter(num => !isNaN(num));
                if (numericIds.length > 0) {
                    const maxId = Math.max(...numericIds);
                    nextId = `r${maxId + 1}`;
                }
        }
        await firestore.collection('respuestas').doc(nextId).set({
            id_pregunta,
            letra: respuesta.letra,
            texto: respuesta.texto
        });
        return { nextId };
    } catch (error) {
        console.error('createRespuesta error:', error);
        return { error: 'Error al crear respuesta' };
    }   
}   

export const getAllRespuestas = async (req: Request, res: Response) => {
    try {
        const respuestas = await firestore.collection('respuestas').get();
        return res.json(respuestas.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
        console.error('getAllRespuestas error:', error);
        return res.status(500).json({ error: 'Error al obtener respuestas' });
    }
}   

export const getPerfiles = async (req: Request, res: Response) => {
    try {
        const perfiles = await firestore.collection('rutas_aprendizaje').get();
        return res.json(perfiles.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
        console.error('getPerfiles error:', error);
        return res.status(500).json({ error: 'Error al obtener perfiles' });
    }
}

export const getPerfilById = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const perfil = await firestore.collection('rutas_aprendizaje').doc(id).get();
        return res.json(perfil.data());
    } catch (error) {
        console.error('getPerfilById error:', error);
        return res.status(500).json({ error: 'Error al obtener perfil' });
    }
}

export const updateRespuesta = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { texto } = req.body;

    try {
        await firestore.collection('respuestas').doc(id).update({ texto });
        return res.json({ success: true });
    } catch (error) {
        console.error('updateRespuesta error:', error);
        return res.status(500).json({ error: 'Error al actualizar respuesta' });
    }
}

export const createPerfil = async (req: Request, res: Response) => {
    const { nombre, descripcion, icono, color } = req.body;
    try {
        const docId = nombre.toLowerCase().replace(/\s+/g, '-');
        await firestore.collection('rutas_aprendizaje').doc(docId).set({ nombre, descripcion, icono, color });
        return res.json({ success: true });
    } catch (error) {
        console.error('createPerfil error:', error);
        return res.status(500).json({ error: 'Error al crear perfil' });
    }
}

export const updatePerfil = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { nombre, descripcion, icono, color } = req.body;
    try {
        await firestore.collection('rutas_aprendizaje').doc(id).update({ nombre, descripcion, icono, color });
        return res.json({ success: true });
    } catch (error) {
        console.error('updatePerfil error:', error);
        return res.status(500).json({ error: 'Error al actualizar perfil' });
    }
}

export const deletePerfil = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        await firestore.collection('rutas_aprendizaje').doc(id).delete();
        return res.json({ success: true });
    } catch (error) {
        console.error('deletePerfil error:', error);
        return res.status(500).json({ error: 'Error al eliminar perfil' });
    }
}