import { firestore } from "../../config/firebase";
import { Request, Response } from "express";



export const getPreguntaById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const pregunta = await firestore.collection('preguntas').doc(id).get();

        const respuestas = [];

        for (const id_pregunta of pregunta.data()?.id_respuestas) {
            const respuesta = await firestore.collection('respuestas').doc(id_pregunta).get();
            respuestas.push(respuesta.data());
        }

        return res.json({
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